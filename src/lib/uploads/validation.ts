/**
 * Ravelyth Talent upload validation.
 *
 * Pure and dependency-free so every rejection rule is unit tested without a
 * filesystem or database. The rules deliberately do NOT trust the client:
 *
 *  - The extension must be explicitly allowed; a large blocklist of
 *    executable/script extensions is refused even when renamed.
 *  - A declared MIME type that is present AND wrong is refused rather than
 *    trusted. Browsers are inconsistent about DOC/DOCX, so an empty or generic
 *    type is allowed and the extension decides.
 *  - `sniffContent` inspects the real leading bytes. A renamed executable will
 *    not carry PDF/DOCX/OLE magic bytes. This defence in depth is why a client
 *    cannot simply claim "application/pdf".
 *  - The browser-supplied filename is only ever used to derive a safe display
 *    name; it never becomes a storage path.
 *  - A size limit is enforced in addition to the request-body guard.
 */

/** Resume document types. */
export const ALLOWED_RESUME_EXTENSIONS = ['pdf', 'doc', 'docx'] as const;
export type AllowedResumeExtension = (typeof ALLOWED_RESUME_EXTENSIONS)[number];

export const ALLOWED_RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** Avatars and company logos. */
export const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
export type AllowedImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number];

export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Extensions that are never accepted, even when renamed. Listed explicitly so a
 * reviewer can see the dangerous set was considered rather than assumed.
 */
export const BLOCKED_FILE_EXTENSIONS = [
  'exe', 'msi', 'bat', 'cmd', 'com', 'cpl', 'scr', 'pif', 'dll', 'sys',
  'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'ps1', 'psm1', 'jar',
  'sh', 'bash', 'zsh', 'py', 'rb', 'pl', 'php', 'asp', 'aspx', 'jsp',
  'cgi', 'html', 'htm', 'xhtml', 'svg', 'xml', 'hta', 'lnk', 'url', 'reg',
  'iso', 'img', 'dmg', 'apk', 'deb', 'rpm',
] as const;

/** Maximum display-name length kept in the database. */
export const MAX_FILENAME_LENGTH = 180;

export interface FileDescriptor {
  filename: string;
  /** Client-declared type. Treated as a hint, never as proof. */
  contentType: string | null;
  byteSize: number;
}

export interface ValidatedFile {
  /** Sanitized display filename (safe to render). Never used as a path. */
  filename: string;
  extension: string;
  mimeType: string;
}

export type FileValidationResult =
  | { ok: true; file: ValidatedFile }
  | { ok: false; error: string };

/** Returns the lowercase extension of a filename, or '' when there is none. */
export function extractExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Sanitizes a user-supplied filename into a safe display name: no directory
 * component, no leading dots, no shell/URL-meaningful characters.
 */
export function sanitizeFilename(filename: string): string {
  const withoutPaths = filename.replace(/\\/g, '/').split('/').pop() ?? '';
  const cleaned = withoutPaths
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  if (cleaned.length === 0) return 'upload';
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;
  // Preserve the extension when truncating so the UI shows a sensible name.
  const extension = extractExtension(cleaned);
  const stem = cleaned.slice(0, MAX_FILENAME_LENGTH - extension.length - 1);
  return extension.length > 0 ? `${stem}.${extension}` : stem;
}

function normalizeExtension(value: string): string {
  return extractExtension(value.trim().toLowerCase());
}

/** Canonical MIME type for a permitted extension. */
export function mimeForAllowedExtension(extension: string): string | null {
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return null;
  }
}

function formatMegabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

/**
 * Validates a resume upload against extension, MIME type and size.
 */
export function validateResumeFile(
  descriptor: FileDescriptor,
  maxBytes: number
): FileValidationResult {
  const filename = sanitizeFilename(descriptor.filename);
  const extension = normalizeExtension(descriptor.filename);

  if (!Number.isFinite(descriptor.byteSize) || descriptor.byteSize <= 0) {
    return { ok: false, error: 'The uploaded file is empty.' };
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || descriptor.byteSize > maxBytes) {
    return { ok: false, error: `The résumé must be smaller than ${formatMegabytes(maxBytes)}.` };
  }
  if (extension.length === 0) {
    return { ok: false, error: 'The résumé must be a PDF, DOC or DOCX file.' };
  }
  if ((BLOCKED_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, error: 'That file type is not accepted.' };
  }
  if (!(ALLOWED_RESUME_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, error: 'The résumé must be a PDF, DOC or DOCX file.' };
  }

  const declared = (descriptor.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (
    declared.length > 0 &&
    declared !== 'application/octet-stream' &&
    !(ALLOWED_RESUME_MIME_TYPES as readonly string[]).includes(declared)
  ) {
    return { ok: false, error: 'The résumé must be a PDF, DOC or DOCX file.' };
  }

  return { ok: true, file: { filename, extension, mimeType: mimeForAllowedExtension(extension)! } };
}

/** Validates an avatar or company-logo upload. */
export function validateImageFile(
  descriptor: FileDescriptor,
  maxBytes: number
): FileValidationResult {
  const filename = sanitizeFilename(descriptor.filename);
  const extension = normalizeExtension(descriptor.filename);

  if (!Number.isFinite(descriptor.byteSize) || descriptor.byteSize <= 0) {
    return { ok: false, error: 'The uploaded file is empty.' };
  }
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || descriptor.byteSize > maxBytes) {
    return { ok: false, error: `The image must be smaller than ${formatMegabytes(maxBytes)}.` };
  }
  if (extension.length === 0) {
    return { ok: false, error: 'The image must be a PNG, JPG or WEBP file.' };
  }
  if ((BLOCKED_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, error: 'That file type is not accepted.' };
  }
  if (!(ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) {
    return { ok: false, error: 'The image must be a PNG, JPG or WEBP file.' };
  }

  const declared = (descriptor.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (
    declared.length > 0 &&
    declared !== 'application/octet-stream' &&
    !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(declared)
  ) {
    return { ok: false, error: 'The image must be a PNG, JPG or WEBP file.' };
  }

  return { ok: true, file: { filename, extension, mimeType: mimeForAllowedExtension(extension)! } };
}

/**
 * Signature sniffing: does the content look like the format its extension
 * claims? This is why a client cannot simply assert a PDF content type.
 */
export function hasPlausibleSignature(head: Uint8Array, extension: string): boolean {
  if (head.length === 0) return false;
  const startsWith = (bytes: number[]): boolean =>
    head.length >= bytes.length && bytes.every((byte, index) => head[index] === byte);

  // Executable / archive / script signatures that must never pass.
  const dangerous: number[][] = [
    [0x4d, 0x5a], // MZ — Windows PE (EXE/DLL)
    [0x7f, 0x45, 0x4c, 0x46], // ELF
    [0x23, 0x21], // shebang
    [0xca, 0xfe, 0xba, 0xbe], // Mach-O / Java class
    [0x1f, 0x8b], // gzip
  ];

  if (extension === 'pdf') return startsWith([0x25, 0x50, 0x44, 0x46]); // %PDF
  if (extension === 'png') return startsWith([0x89, 0x50, 0x4e, 0x47]);

  if (extension === 'webp') {
    return (
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      head.length >= 12 &&
      head[8] === 0x57 &&
      head[9] === 0x45 &&
      head[10] === 0x42 &&
      head[11] === 0x50
    );
  }

  if (extension === 'jpg' || extension === 'jpeg') return startsWith([0xff, 0xd8, 0xff]);

  if (extension === 'docx') {
    // DOCX is a ZIP container.
    return startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06]);
  }

  if (extension === 'doc') {
    if (startsWith([0xd0, 0xcf, 0x11, 0xe0])) return true; // OLE2 compound file
    if (dangerous.some((signature) => startsWith(signature))) return false;
    // Plain-text DOC / RTF fallback: refuse only control-heavy binary content.
    return !head.slice(0, 512).some((byte) => byte === 0x00);
  }

  return false;
}

/**
 * Full content check combining the declared extension with the real bytes.
 * Returns an error string when the content is refused, or null when accepted.
 */
export function sniffContent(body: Uint8Array, extension: string): string | null {
  if (body.byteLength === 0) return 'The uploaded file is empty.';

  // Refuse dangerous binaries regardless of the claimed extension.
  const head = body.slice(0, 16);
  const isExecutable =
    (head[0] === 0x4d && head[1] === 0x5a) ||
    (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) ||
    (head[0] === 0x23 && head[1] === 0x21);

  if (isExecutable) return 'That file type is not accepted.';

  // A ZIP container (which is what a .docx is) must not also carry an
  // executable marker. Refusing this blocks a renamed EXE-in-ZIP payload, which
  // would otherwise satisfy the plain "PK\x03\x04" DOCX signature.
  if (extension === 'docx' || extension === 'doc') {
    const window = body.slice(0, Math.min(body.byteLength, 4096));
    for (let index = 0; index + 1 < window.length; index += 1) {
      const a = window[index];
      const b = window[index + 1];
      // MZ header or a shebang anywhere in the archive window.
      if ((a === 0x4d && b === 0x5a) || (a === 0x23 && b === 0x21)) {
        return 'That file type is not accepted.';
      }
    }
  }

  if (!hasPlausibleSignature(body, extension)) {
    return 'The file content does not match its file type.';
  }
  return null;
}
