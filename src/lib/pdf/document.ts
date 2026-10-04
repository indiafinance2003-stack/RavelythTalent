import 'server-only';
import PDFDocument from 'pdfkit';

import {
  PDF_FONT_BOLD,
  PDF_FONT_ITALIC,
  PDF_FONT_REGULAR,
  PDF_FONT_SERIF,
  PDF_FONT_SERIF_BOLD,
  pdfFontsAvailable,
  pdfFontSource,
} from './fonts';

/**
 * A thin, page-break-aware writer over PDFKit.
 *
 * WHY NOT CALL PDFKIT DIRECTLY FROM EACH RENDERER
 *
 * Two problems show up the moment a resume runs past one page, and both are
 * silent:
 *
 *  1. PDFKit happily draws text past the bottom margin and only breaks a page
 *     when it runs out of ROOM — so a paragraph can silently overlap whatever is
 *     drawn there. Every text call here is bounded by an explicit content limit.
 *  2. A section heading is emitted, then the page breaks, leaving a heading
 *     alone at the foot of a page. `ensureSpace` makes the caller declare how
 *     much must stay together, and the break happens BEFORE the heading.
 *
 * The bottom margin deliberately includes space for the footer, so PDFKit's own
 * auto-pagination can never drop a line into the footer band.
 */

/** Colours are six-digit hex without a leading '#', as PDFKit expects. */
export interface PdfTheme {
  accent: string;
  accentSoft: string;
  text: string;
  muted: string;
  rule: string;
  pageBackground: string;
}

export const DEFAULT_PDF_THEME: PdfTheme = {
  accent: '1e3a8a',
  accentSoft: 'eef2ff',
  text: '111827',
  muted: '4b5563',
  rule: 'd1d5db',
  pageBackground: 'ffffff',
};

export interface PdfMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_PDF_MARGINS: PdfMargins = { top: 48, right: 48, bottom: 48, left: 48 };

export interface PdfDocumentOptions {
  title: string;
  subject?: string;
  author?: string;
  keywords?: string;
  creator?: string;
  theme?: Partial<PdfTheme>;
  margins?: Partial<PdfMargins>;
  /** Repeated at the foot of every page. */
  footer?: string;
  size?: 'A4' | 'LETTER';
}

/** Space held back at the foot of each page for the footer band. */
const FOOTER_RESERVE = 46;

export class PdfFontError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfFontError';
  }
}

type TextStyle = {  font?: string;
  size?: number;
  color?: string;
  lineGap?: number;
  align?: 'left' | 'center' | 'right' | 'justify';
  indent?: number;
};

/** A table column; `width` is a fraction of the region's content width. */
export interface PdfColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

/**
 * PDFKit's constructor is typed as a factory, so the document instance type has
 * to be derived from it rather than imported.
 */
type PdfKitDocument = InstanceType<typeof PDFDocument>;

export class PdfWriter {
  readonly doc: PdfKitDocument;
  readonly theme: PdfTheme;
  readonly margins: PdfMargins;
  readonly pageWidth: number;
  readonly pageHeight: number;

  private readonly footerText: string;
  private readonly bottomLimit: number;

  /**
   * The horizontal slice currently being drawn into.
   *
   * A two-column resume needs two independent flows down the same page, so the
   * cursor's x-origin and width are state rather than constants. Because the
   * regions are horizontally disjoint they can both continue across a page break
   * without overlapping — the sidebar stays on the left of page 2 while the main
   * column continues on the right.
   */
  private regionLeft: number;
  private regionWidth: number;
  private regionFill: string | null;

  constructor(options: PdfDocumentOptions) {
    if (!pdfFontsAvailable()) {
      throw new PdfFontError(
        'The bundled PDF fonts are missing from src/lib/pdf/fonts. A PDF that renders the rupee sign needs them.'
      );
    }

    this.theme = { ...DEFAULT_PDF_THEME, ...options.theme };
    this.margins = { ...DEFAULT_PDF_MARGINS, ...options.margins };
    this.footerText = options.footer ?? '';

    const size = options.size === 'LETTER' ? 'LETTER' : 'A4';
    // The footer band is folded into the bottom margin so PDFKit's implicit page
    // break can never place a line of content inside it.
    this.doc = new PDFDocument({
      size,
      margins: {
        top: this.margins.top,
        right: this.margins.right,
        bottom: this.margins.bottom + FOOTER_RESERVE,
        left: this.margins.left,
      },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: options.title,
        Subject: options.subject ?? '',
        Author: options.author ?? 'Ravelyth Talent',
        Keywords: options.keywords ?? '',
        Creator: options.creator ?? 'Ravelyth Talent',
        Producer: 'Ravelyth Talent',
      },
    });

    this.doc.registerFont(PDF_FONT_REGULAR, pdfFontSource(PDF_FONT_REGULAR));
    this.doc.registerFont(PDF_FONT_BOLD, pdfFontSource(PDF_FONT_BOLD));
    this.doc.registerFont(PDF_FONT_ITALIC, pdfFontSource(PDF_FONT_ITALIC));
    this.doc.registerFont(PDF_FONT_SERIF, pdfFontSource(PDF_FONT_SERIF));
    this.doc.registerFont(PDF_FONT_SERIF_BOLD, pdfFontSource(PDF_FONT_SERIF_BOLD));

    this.pageWidth = this.doc.page.width;
    this.pageHeight = this.doc.page.height;

    this.regionLeft = this.margins.left;
    this.regionWidth = this.pageWidth - this.margins.left - this.margins.right;
    this.regionFill = null;

    if (this.theme.pageBackground.toLowerCase() !== 'ffffff') {
      this.paintPage(this.theme.pageBackground);
    }

    this.bottomLimit = this.pageHeight - this.margins.bottom - FOOTER_RESERVE;
  }

  /* ----------------------------------------------------------------- geometry */

  /** Left edge of the region being drawn into. */
  get left(): number {
    return this.regionLeft;
  }

  /** Right edge of the region being drawn into. */
  get right(): number {
    return this.regionLeft + this.regionWidth;
  }

  /** Width of the region being drawn into. */
  get width(): number {
    return this.regionWidth;
  }

  /**
   * Draws `render` into a narrower vertical slice of the page.
   *
   * `fill` tints the slice down its full height on every page it spans, which is
   * what makes a sidebar read as a panel rather than as a box drawn once.
   */
  withRegion(left: number, width: number, fill: string | null, render: () => void): void {
    const previous = { left: this.regionLeft, width: this.regionWidth, fill: this.regionFill };
    this.regionLeft = left;
    this.regionWidth = width;
    this.regionFill = fill;

    if (fill) this.paintRegion(fill);
    try {
      render();
    } finally {
      this.regionLeft = previous.left;
      this.regionWidth = previous.width;
      this.regionFill = previous.fill;
    }
  }

  /** Current vertical cursor, in PDF points from the top of the page. */
  get y(): number {
    return this.doc.y;
  }

  /** Usable height remaining before the footer band. */
  remaining(): number {
    return Math.max(0, this.bottomLimit - this.doc.y);
  }

  /**
   * Vertical space a string will occupy, including indentation.
   *
   * The font and size are pinned onto the document before measuring. PDFKit's
   * `heightOfString` measures against the document's *current* font state rather
   * than the size passed in, so without this the result drifts with whatever was
   * drawn last — a caller reserving space for 10pt text after a 12pt heading gets
   * the 12pt height back, and the real string then overflows its reservation.
   */
  measure(text: string, style: TextStyle = {}): number {
    const indent = style.indent ?? 0;
    this.doc.font(style.font ?? PDF_FONT_REGULAR).fontSize(style.size ?? 10);

    return this.doc.heightOfString(text, {
      width: this.width - indent,
      lineGap: style.lineGap ?? 0,
    });
  }

  /** Horizontal space a string will occupy. */
  widthOf(text: string, style: TextStyle = {}): number {
    this.doc.font(style.font ?? PDF_FONT_REGULAR).fontSize(style.size ?? 10);
    return this.doc.widthOfString(text, { lineGap: style.lineGap ?? 0 });
  }

  /**
   * Breaks to a new page unless `height` still fits.
   *
   * `keep` lets a caller ask for more than the block itself needs, which is how a
   * heading is kept attached to the first lines of what follows it.
   */
  ensureSpace(height: number, keep = 0): boolean {
    if (this.remaining() >= height + keep) return false;
    this.newPage();
    return true;
  }

  newPage(): void {
    this.doc.addPage({ size: this.doc.page.size as 'A4' | 'LETTER' });
    if (this.theme.pageBackground.toLowerCase() !== 'ffffff') {
      this.paintPage(this.theme.pageBackground);
    }
    if (this.regionFill) this.paintRegion(this.regionFill);
    this.doc.y = this.margins.top;
  }

  /** Paints the full-bleed page background. Drawn before any content. */
  private paintPage(color: string): void {
    this.doc.save();
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight).fill(color);
    this.doc.restore();
  }

  /** Paints the active region's fill from the top margin to the footer band. */
  private paintRegion(color: string): void {
    this.doc.save();
    this.doc
      .rect(this.regionLeft, 0, this.regionWidth, this.bottomLimit + FOOTER_RESERVE)
      .fill(color);
    this.doc.restore();
  }

  /** Moves the cursor down, never past the footer band. */
  moveDown(points: number): void {
    this.doc.y = Math.min(this.doc.y + points, this.bottomLimit);
  }

  /* ------------------------------------------------------------------- text */

  /**
   * Writes text at the cursor and returns the height consumed.
   *
   * `ensure` is the height the caller wants kept with this block; when the block
   * would not fit, the page breaks first instead of being split.
   */
  text(value: string, style: TextStyle & { ensure?: number } = {}): number {
    const normalized = value.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
    const indent = style.indent ?? 0;
    const size = style.size ?? 10;
    const lineGap = style.lineGap ?? 0;

    if (!normalized.trim()) {
      this.moveDown(size * 0.6);
      return size * 0.6;
    }

    const height = this.measure(normalized, { ...style, indent });
    this.ensureSpace(height, style.ensure ?? 0);

    this.doc
      .font(style.font ?? PDF_FONT_REGULAR)
      .fontSize(size)
      .fillColor(style.color ?? this.theme.text)
      .text(normalized, this.left + indent, this.doc.y, {
        width: this.width - indent,
        align: style.align ?? 'left',
        lineGap,
      });

    return height;
  }

  /** A large title, used once at the top of a document. */
  title(value: string, size = 24): void {
    this.text(value, { font: PDF_FONT_SERIF_BOLD, size, color: this.theme.accent, lineGap: 2 });
  }

  /**
   * A section heading with an optional rule underneath.
   *
   * Callers pass `ensure` so the heading cannot be stranded at a page foot.
   */
  sectionHeading(value: string, ensure = 0): void {
    const label = value.toUpperCase();
    this.ensureSpace(30 + ensure);
    this.doc
      .font(PDF_FONT_BOLD)
      .fontSize(8.5)
      .fillColor(this.theme.accent)
      .text(label, this.left, this.doc.y, { width: this.width, characterSpacing: 1.1 });
    this.moveDown(3);
    this.rule(this.theme.accent, 1);
    this.moveDown(9);
  }

  /** A horizontal line across the content width. */
  rule(color = this.theme.rule, thickness = 0.5, inset = 0): void {
    const top = this.doc.y;
    this.doc
      .save()
      .strokeColor(color)
      .lineWidth(thickness)
      .moveTo(this.left + inset, top)
      .lineTo(this.right - inset, top)
      .stroke()
      .restore();
    this.doc.y = top + thickness;
  }

  /** Body copy with a slightly looser leading than `text`. */
  paragraph(value: string, options: { ensure?: number; size?: number; color?: string } = {}): void {
    this.text(value, {
      size: options.size ?? 9.5,
      lineGap: 3,
      color: options.color ?? this.theme.text,
      ensure: options.ensure ?? 0,
    });
  }

  /** Bulleted lines, with the marker hanging in the margin. */
  bullets(items: string[], options: { size?: number; color?: string } = {}): void {
    const size = options.size ?? 9.5;
    const hanging = 12;
    for (const item of items) {
      const normalized = item.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      const height = this.measure(normalized, { size, indent: hanging });
      this.ensureSpace(height);
      const top = this.doc.y;
      this.doc
        .circle(this.left + 3, top + size * 0.42, 1.6)
        .fillColor(options.color ?? this.theme.muted)
        .fill();
      this.doc
        .font(PDF_FONT_REGULAR)
        .fontSize(size)
        .fillColor(this.theme.text)
        .text(normalized, this.left + hanging, top, { width: this.width - hanging, lineGap: 2 });
      this.doc.y = top + height;
    }
  }

  /**
   * Renders `label` and `value` on one line when they fit, otherwise stacks them.
   *
   * This is how contact details, education entries and job meta lines are laid
   * out: `Company · Title` on the left, dates on the right, and a graceful
   * fallback instead of overlap when a value is long.
   */
  inlinePair(label: string, value: string, options: { labelWidth?: number; size?: number } = {}): void {
    const size = options.size ?? 9.5;
    const labelWidth = options.labelWidth ?? this.width * 0.58;
    const bold = this.widthOf(label, { font: PDF_FONT_BOLD, size });
    const regular = this.widthOf(value, { size });

    if (bold + regular + 12 <= this.width) {
      this.ensureSpace(size * 1.5);
      const top = this.doc.y;
      this.doc
        .font(PDF_FONT_BOLD)
        .fontSize(size)
        .fillColor(this.theme.text)
        .text(label, this.left, top, { width: labelWidth, lineBreak: false });
      this.doc
        .font(PDF_FONT_REGULAR)
        .fontSize(size)
        .fillColor(this.theme.muted)
        .text(value, this.left + labelWidth, top, { width: this.width - labelWidth, align: 'right' });
      this.doc.y = top + size * 1.45;
      return;
    }

    this.text(label, { font: PDF_FONT_BOLD, size });
    this.text(value, { size, color: this.theme.muted });
  }

  /** Label on the left, value flush right, wrapping the label when necessary. */
  definitionRow(label: string, value: string, options: { size?: number; gap?: number } = {}): void {
    const size = options.size ?? 9.5;
    const gap = options.gap ?? 14;
    const labelWidth = Math.max(120, this.width * 0.4);
    const valueWidth = this.width - labelWidth - gap;
    const height = Math.max(
      this.measure(label, { size, indent: 0 }),
      this.measure(value, { size })
    );

    this.ensureSpace(height + 2);
    const top = this.doc.y;
    this.doc
      .font(PDF_FONT_REGULAR)
      .fontSize(size)
      .fillColor(this.theme.muted)
      .text(label, this.left, top, { width: labelWidth });
    this.doc
      .font(PDF_FONT_BOLD)
      .fontSize(size)
      .fillColor(this.theme.text)
      .text(value, this.left + labelWidth + gap, top, { width: valueWidth, align: 'right' });
    this.doc.y = top + height;
  }

  /* ------------------------------------------------------------------ tables */

  /**
   * Draws a table with a repeating header row.
   *
   * Rows never split: a row that does not fit starts a new page, because a line
   * item with its description on the previous page and its amount on the next
   * is exactly the kind of thing that makes a customer distrust an invoice.
   */
  table(columns: PdfColumn[], rows: string[][], options: { size?: number } = {}): void {
    const size = options.size ?? 9.5;
    const padX = 6;
    const padY = 6;
    const widths = columns.map((column) => Math.max(40, this.width * column.width));
    const scale = this.width / widths.reduce((sum, value) => sum + value, 0);

    const headerHeight = () => {
      this.doc.font(PDF_FONT_BOLD).fontSize(size - 0.5);
      return (
        Math.max(...columns.map((column) => this.measure(column.header, { size: size - 0.5 })), 0) + padY * 2
      );
    };

    const rowHeight = (cells: string[]): number =>
      Math.max(...cells.map((cell) => this.measure(cell ?? '', { size })), 0) + padY * 2;

    const drawRow = (cells: string[], bold: boolean, shade: string | null): number => {
      const height = bold ? headerHeight() : rowHeight(cells);
      this.ensureSpace(height);

      const top = this.doc.y;
      if (shade) {
        this.doc.save().rect(this.left, top, this.width, height).fill(shade).restore();
      }

      let x = this.left;
      columns.forEach((column, index) => {
        const width = widths[index]! * scale - padX * 2;
        this.doc
          .font(bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR)
          .fontSize(bold ? size - 0.5 : size)
          .fillColor(bold ? this.theme.accent : this.theme.text)
          .text(cells[index] ?? '', x + padX, top + padY, {
            width,
            align: column.align === 'right' ? 'right' : 'left',
            lineGap: 1,
          });
        x += widths[index]! * scale;
      });

      this.doc.y = top + height;
      return height;
    };

    drawRow(
      columns.map((column) => column.header),
      true,
      this.theme.accentSoft
    );

    rows.forEach((cells, index) => {
      drawRow(cells, false, index % 2 === 1 ? 'f9fafb' : null);
    });
  }

  /* ----------------------------------------------------------------- accents */

  /** A filled accent bar, used as a header band or sidebar cap. */
  accentBar(height: number, color = this.theme.accent, inset = 0): void {
    const top = this.doc.y;
    this.doc.save().rect(this.left + inset, top, this.width - inset * 2, height).fill(color).restore();
    this.doc.y = top + height;
  }

  /** Highlights a value — used for invoice totals. */
  highlightRow(label: string, value: string, options: { color?: string; size?: number } = {}): void {
    const size = options.size ?? 11;
    const color = options.color ?? this.theme.accent;
    const height = size * 2.1;
    this.ensureSpace(height);
    const top = this.doc.y;

    this.doc.save().rect(this.left, top, this.width, height).fill(this.theme.accentSoft).restore();
    this.doc
      .font(PDF_FONT_BOLD)
      .fontSize(size)
      .fillColor(color)
      .text(label, this.left + 8, top + height / 2 - size * 0.72, { width: this.width * 0.5 });
    this.doc
      .font(PDF_FONT_BOLD)
      .fontSize(size)
      .fillColor(color)
      .text(value, this.left + this.width * 0.5, top + height / 2 - size * 0.72, {
        width: this.width * 0.5 - 8,
        align: 'right',
      });

    this.doc.y = top + height;
  }

  /** A boxed note, for payment terms or a candidate's own summary callout. */
  callout(value: string, options: { color?: string; size?: number } = {}): void {
    const size = options.size ?? 9;
    const pad = 10;
    const height = this.measure(value, { size }) + pad * 2;
    this.ensureSpace(height);
    const top = this.doc.y;
    const color = options.color ?? this.theme.accent;

    this.doc
      .save()
      .rect(this.left, top, this.width, height)
      .fill(this.theme.accentSoft)
      .restore();
    this.doc.save().rect(this.left, top, 2.5, height).fill(color).restore();
    this.doc
      .font(PDF_FONT_REGULAR)
      .fontSize(size)
      .fillColor(this.theme.text)
      .text(value, this.left + pad + 2, top + pad, { width: this.width - pad * 2 - 2, lineGap: 2 });

    this.doc.y = top + height;
  }

  /* ----------------------------------------------------------------- output */

  /**
   * Writes the footer on every buffered page, then resolves with the PDF bytes.
   *
   * `bufferPages` was set in the constructor, so each page is already laid out
   * and can be revisited to stamp "Page 1 of 3" — the total is only knowable
   * once the document is finished.
   */
  async finish(): Promise<Buffer> {
    // Footers span the whole page, so any column region is left behind first.
    this.regionLeft = this.margins.left;
    this.regionWidth = this.pageWidth - this.margins.left - this.margins.right;

    for (let index = 0; index < this.doc.bufferedPageRange().count; index += 1) {
      this.stampFooter(index);
    }

    const chunks = await new Promise<Buffer[]>((resolve, reject) => {
      const collected: Buffer[] = [];
      this.doc.on('data', (chunk: Buffer) => collected.push(chunk));
      this.doc.on('end', () => resolve(collected));
      this.doc.on('error', reject);
      this.doc.end();
    });

    return Buffer.concat(chunks);
  }

  /**
   * Stamps the footer band on one buffered page.
   *
   * The page's margins are zeroed first, and that is not cosmetic: the footer
   * sits BELOW the bottom margin by design, and PDFKit's `text()` starts a new
   * page whenever the cursor passes `page.maxY()`. Without this, stamping the
   * footer on page 1 would append a blank page 2, stamping that would append
   * page 3, and so on — a one-page document would ship with two blank pages and
   * a "Page 1 of 1" footer lying about it.
   */
  private stampFooter(index: number): void {
    this.doc.switchToPage(index);
    const page = this.doc.page;
    const total = this.doc.bufferedPageRange().count;
    const savedMargins = page.margins;
    page.margins = { top: 0, right: 0, bottom: 0, left: 0 };

    try {
      const y = this.pageHeight - this.margins.bottom - 20;

      this.doc
        .save()
        .strokeColor(this.theme.rule)
        .lineWidth(0.5)
        .moveTo(this.margins.left, y - 12)
        .lineTo(this.pageWidth - this.margins.right, y - 12)
        .stroke()
        .restore();

      if (this.footerText) {
        this.doc
          .font(PDF_FONT_REGULAR)
          .fontSize(7.5)
          .fillColor(this.theme.muted)
          .text(this.footerText, this.margins.left, y, { lineBreak: false });
      }

      this.doc
        .font(PDF_FONT_REGULAR)
        .fontSize(7.5)
        .fillColor(this.theme.muted)
        .text(`Page ${index + 1} of ${total}`, this.margins.left, y, {
          width: this.pageWidth - this.margins.left - this.margins.right,
          align: 'right',
          lineBreak: false,
        });
    } finally {
      page.margins = savedMargins;
    }
  }
}

export type { TextStyle as PdfTextStyle };
