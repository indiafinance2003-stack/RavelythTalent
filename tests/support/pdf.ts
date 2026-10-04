import { inflateSync } from 'zlib';

/**
 * A very small PDF reader, used only by tests.
 *
 * WHY THIS EXISTS INSTEAD OF A PDF LIBRARY
 *
 * The point of these tests is to prove a generated document really contains the
 * real invoice number, the real line items and the real rupee amounts — not
 * that a PDF library round-trips a PDF. Searching the raw bytes for a string
 * does not work: PDFKit embeds a subsetted TrueType font and draws text as
 * glyph IDs under `Identity-H`, so "₹7,999.00" is written as hex glyph codes
 * and never appears as those characters. Poppler or pdf.js could decode it, but
 * that is a large dependency pulled in for one assertion.
 *
 * So this file does the minimum honest thing: read the object table, inflate
 * every stream, and use the `ToUnicode` CMaps PDFKit emits for each embedded
 * subset to translate glyph IDs back into characters. Glyph IDs are only
 * meaningful per font — two subsets both call glyph 3 something different — so
 * each text run is decoded with the CMap belonging to the font selected by the
 * preceding `Tf` operator. If a renderer ever stopped writing a ToUnicode map,
 * the text would be unrecoverable and these tests would fail, which is the
 * correct outcome for a document nobody can copy text out of.
 */

interface PdfObject {
  dict: string;
  stream: string | null;
}

type GlyphMap = Map<number, string>;

/** Splits a PDF into its indirect objects, keeping binary stream payloads intact. */
function parseObjects(buffer: Buffer): Map<number, PdfObject> {
  const raw = buffer.toString('latin1');
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+\d+\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = header.exec(raw)) !== null) {
    const number = Number(match[1]);
    const bodyStart = match.index + match[0].length;
    const streamStart = raw.indexOf('stream', bodyStart);
    const endObject = raw.indexOf('endobj', bodyStart);

    if (streamStart === -1 || (endObject !== -1 && endObject < streamStart)) {
      if (endObject === -1) break;
      objects.set(number, { dict: raw.slice(bodyStart, endObject), stream: null });
      header.lastIndex = endObject + 'endobj'.length;
      continue;
    }

    let dataStart = streamStart + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart += 1;
    if (raw[dataStart] === '\n') dataStart += 1;

    // The declared /Length is unreliable after a partial write, so the payload
    // is bounded by the next `endstream` with trailing EOL trimmed off.
    let dataEnd = raw.indexOf('endstream', dataStart);
    if (dataEnd === -1) dataEnd = raw.length;
    while (dataEnd > dataStart && (raw[dataEnd - 1] === '\n' || raw[dataEnd - 1] === '\r')) dataEnd -= 1;

    objects.set(number, { dict: raw.slice(bodyStart, streamStart), stream: raw.slice(dataStart, dataEnd) });

    const end = raw.indexOf('endobj', dataEnd);
    header.lastIndex = end === -1 ? dataEnd : end + 'endobj'.length;
  }

  return objects;
}

function inflate(stream: string): string {
  const bytes = Buffer.from(stream, 'latin1');
  try {
    return inflateSync(bytes).toString('latin1');
  } catch {
    return bytes.toString('latin1');
  }
}

function parseHex(token: string): Buffer {
  const body = token.replace(/[^0-9A-Fa-f]/g, '');
  return Buffer.from(body.length % 2 === 0 ? body : `${body}0`, 'hex');
}

/** Decodes a PDF literal string's escape sequences. */
function decodeLiteralString(token: string): string {
  const body = token.slice(1, -1);
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = body[i + 1];
    i += 1;
    if (next === undefined) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (/[0-7]/.test(next)) {
      const octal = body.slice(i, i + 3).match(/^[0-7]{1,3}/)?.[0] ?? next;
      out += String.fromCharCode(parseInt(octal, 8));
      i += octal.length - 1;
    } else out += next;
  }
  return out;
}

function utf16Be(bytes: Buffer): string {
  if (bytes.length === 0) return '';
  if (bytes.length === 1) return String.fromCharCode(bytes[0]!);
  const swapped = Buffer.from(bytes);
  swapped.swap16();
  return swapped.toString('utf16le');
}

/**
 * Parses every `beginbfchar` / `beginbfrange` block into a single glyph map.
 *
 * Destination hex strings may contain internal whitespace when a single glyph
 * maps to more than one UTF-16 unit. Subsetted DejaVu faces do exactly this:
 * fontkit folds `fi` into one ligature glyph, so PDFKit emits a destination of
 * `<0066 0069>` for code `0x0b`. A strict `<[0-9A-Fa-f]*>` pattern silently drops
 * that entry, which shifts every later destination by one and turns
 * "fills the page." into "sllp the ga.e".
 */
function parseCMap(text: string): GlyphMap {
  const map: GlyphMap = new Map();

  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const pair of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f\s]*)>/g)) {
      map.set(parseInt(pair[1]!, 16), utf16Be(parseHex(pair[2]!)));
    }
  }

  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    const rows = block.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f\s]*>|\[[^\]]*\])/g,
    );
    for (const row of rows) {
      const low = parseInt(row[1]!, 16);
      const high = parseInt(row[2]!, 16);
      const target = row[3]!;

      if (target.startsWith('[')) {
        // Array form: each element is an explicit destination for one code.
        // PDFKit does not increment these, so ligature units survive intact.
        const items = target.match(/<[0-9A-Fa-f\s]*>/g) ?? [];
        items.forEach((item, offset) => map.set(low + offset, utf16Be(parseHex(item))));
        continue;
      }

      const base = parseHex(target);
      for (let code = low; code <= high; code += 1) {
        const shifted = Buffer.from(base);
        if (shifted.length >= 2) {
          shifted.writeUInt16BE(base.readUInt16BE(0) + (code - low), 0);
        } else {
          shifted[0] = base[0]! + (code - low);
        }
        map.set(code, utf16Be(shifted));
      }
    }
  }

  return map;
}

/**
 * Parses each font object's `/ToUnicode` CMap, keyed by font object number.
 *
 * Glyph IDs are unique within one composite font, and PDFKit gives every
 * registered face of the same family a single Type0 font with several
 * descendant programs but ONE `/ToUnicode`. So the unit of "which table
 * decodes this code" is the font object, never the individual descendant.
 */
function cmapsByFontObject(objects: Map<number, PdfObject>): Map<number, GlyphMap> {
  const cmaps = new Map<number, GlyphMap>();

  for (const [number, object] of objects) {
    if (!/\/Type\s*\/Font/.test(object.dict)) continue;
    const toUnicode = object.dict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (!toUnicode) continue;
    const target = objects.get(Number(toUnicode[1]));
    if (!target?.stream) continue;
    cmaps.set(number, parseCMap(inflate(target.stream)));
  }

  return cmaps;
}

/** Follows an indirect reference, tolerating a dictionary that is inline. */
function resolveDict(objects: Map<number, PdfObject>, dict: string, key: string): string {
  const inline = dict.match(new RegExp(`${key}\\s*<<([\\s\\S]*?)>>`));
  if (inline) return inline[1]!;
  const indirect = dict.match(new RegExp(`${key}\\s+(\\d+)\\s+\\d+\\s+R`));
  if (!indirect) return '';
  return objects.get(Number(indirect[1]))?.dict ?? '';
}

/**
 * Font maps for one page, keyed by the resource name its content stream uses.
 *
 * This must be per page rather than global: PDFKit restarts resource naming on
 * every buffered page, so `/F2` on page 1 and `/F2` on page 2 can be different
 * font objects with different CMaps. A document-wide name-to-CMap map silently
 * resolves most of those to the wrong table.
 */
function pageFontMaps(
  objects: Map<number, PdfObject>,
  pageDict: string,
  cmaps: Map<number, GlyphMap>,
): Map<string, GlyphMap> {
  const fonts = new Map<string, GlyphMap>();
  const resources = resolveDict(objects, pageDict, '/Resources');
  const fontDict = resolveDict(objects, resources, '/Font');

  for (const entry of fontDict.matchAll(/\/([A-Za-z0-9#+.-]+)\s+(\d+)\s+\d+\s+R/g)) {
    const cmap = cmaps.get(Number(entry[2]));
    if (cmap) fonts.set(entry[1]!, cmap);
  }

  return fonts;
}

const TOKEN = /\/(F\d+)\s+[\d.]+\s+Tf|<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\)|TJ|Tj|T\*|Td|TD|ET|BT/g;

/** Translates one content stream back into readable text. */
function decodeContentStream(content: string, fonts: Map<string, GlyphMap>): string {
  let out = '';
  let active: GlyphMap | undefined;

  for (const token of content.matchAll(TOKEN)) {
    const value = token[0];

    if (value.startsWith('/')) {
      active = fonts.get(value.slice(1).split(/\s/)[0]!);
      continue;
    }
    if (value === 'T*' || value === 'Td' || value === 'TD' || value === 'ET' || value === 'BT') {
      out += '\n';
      continue;
    }
    if (value.startsWith('<')) {
      const bytes = parseHex(value);
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const code = (bytes[i]! << 8) | bytes[i + 1]!;
        out += active?.get(code) ?? '';
      }
      continue;
    }
    if (value.startsWith('(')) out += decodeLiteralString(value);
  }

  return out;
}

/** Object numbers referenced by a page's `/Contents`, which may be an array. */
function contentsOf(dict: string): number[] {
  const array = dict.match(/\/Contents\s*\[([^\]]*)\]/);
  if (array) {
    return [...array[1]!.matchAll(/(\d+)\s+\d+\s+R/g)].map((entry) => Number(entry[1]));
  }
  const single = dict.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
  return single ? [Number(single[1])] : [];
}

/**
 * Page dictionaries in reading order.
 *
 * Object number order is NOT page order: PDFKit emits page objects back to
 * front, so sorting by object number returns the last page first. This walks
 * `/Root -> /Pages -> /Kids` instead, and only falls back to number order for a
 * malformed tree.
 */
function orderedPages(objects: Map<number, PdfObject>): PdfObject[] {
  const catalog = [...objects.values()].find((object) => /\/Type\s*\/Catalog/.test(object.dict));
  const rootRef = catalog?.dict.match(/\/Pages\s+(\d+)\s+\d+\s+R/);

  if (rootRef) {
    const ordered: PdfObject[] = [];
    const seen = new Set<number>();
    const walk = (number: number): void => {
      if (seen.has(number)) return;
      seen.add(number);
      const node = objects.get(number);
      if (!node) return;

      const kids = node.dict.match(/\/Kids\s*\[([^\]]*)\]/);
      if (kids) {
        for (const kid of kids[1]!.matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(kid[1]));
        return;
      }
      if (/\/Type\s*\/Page(?![sA-Za-z])/.test(node.dict)) ordered.push(node);
    };
    walk(Number(rootRef[1]));
    if (ordered.length > 0) return ordered;
  }

  return [...objects.entries()]
    .filter(([, object]) => /\/Type\s*\/Page(?![sA-Za-z])/.test(object.dict))
    .sort(([left], [right]) => left - right)
    .map(([, object]) => object);
}

/**
 * Decoded text of each page, in page order.
 *
 * Walks `/Type /Page` objects rather than "every stream that contains `Tj`",
 * because a subsetted font program is binary data that can contain those bytes by
 * coincidence — which would otherwise show up as a phantom blank page.
 */
export function extractPdfTextPages(buffer: Buffer): string[] {
  const objects = parseObjects(buffer);
  const cmaps = cmapsByFontObject(objects);

  return orderedPages(objects).map((page) => {
    const fonts = pageFontMaps(objects, page.dict, cmaps);
    return contentsOf(page.dict)
      .map((reference) => {
        const content = objects.get(reference)?.stream;
        return content ? decodeContentStream(inflate(content), fonts) : '';
      })
      .join('')
      .replace(/[ \t]*\n+/g, '\n')
      .trim();
  });
}

/** All decoded text in a PDF. */
export function extractPdfText(buffer: Buffer): string {
  return extractPdfTextPages(buffer).join('\n');
}
