import { describe, expect, it } from 'vitest';
import {
  ALLOWED_RESUME_EXTENSIONS,
  BLOCKED_FILE_EXTENSIONS,
  hasPlausibleSignature,
  sanitizeFilename,
  sniffContent,
  validateImageFile,
  validateResumeFile,
} from '@/lib/uploads/validation';
import {
  buildStorageKey,
  isSafeStorageKey,
  resolveStoragePath,
  StorageError,
} from '@/lib/storage';

/**
 * Upload and private-storage security (test items 56-59).
 *
 * These rules are why a resume can never be a publicly reachable file and a
 * renamed executable can never be stored.
 */

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Real magic-byte prefixes. */
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const ZIP_EXE_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x4d, 0x5a, 0x90, 0x00]);
const MZ_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const ELF_BYTES = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

describe('resume file validation', () => {
  it('accepts a valid PDF resume', () => {
    const result = validateResumeFile(
      { filename: 'resume.pdf', contentType: 'application/pdf', byteSize: 100_000 },
      MAX_RESUME_BYTES
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.extension).toBe('pdf');
      expect(result.file.mimeType).toBe('application/pdf');
    }
  });

  it('accepts every permitted extension', () => {
    for (const extension of ALLOWED_RESUME_EXTENSIONS) {
      const result = validateResumeFile(
        { filename: `cv.${extension}`, contentType: null, byteSize: 1000 },
        MAX_RESUME_BYTES
      );
      expect(result.ok, extension).toBe(true);
    }
  });

  it('rejects an oversized file and an empty file', () => {
    const oversized = validateResumeFile(
      { filename: 'big.pdf', contentType: 'application/pdf', byteSize: MAX_RESUME_BYTES + 1 },
      MAX_RESUME_BYTES
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toMatch(/smaller than/i);

    expect(
      validateResumeFile(
        { filename: 'empty.pdf', contentType: 'application/pdf', byteSize: 0 },
        MAX_RESUME_BYTES
      ).ok
    ).toBe(false);
  });

  it('rejects a blocked extension even when a benign MIME type is claimed', () => {
    for (const extension of ['exe', 'js', 'php', 'html', 'svg', 'sh']) {
      const result = validateResumeFile(
        { filename: `resume.${extension}`, contentType: 'application/pdf', byteSize: 1000 },
        MAX_RESUME_BYTES
      );
      expect(result.ok, extension).toBe(false);
    }
  });

  it('refuses to trust a lying MIME type', () => {
    const result = validateResumeFile(
      { filename: 'resume.pdf', contentType: 'application/x-msdownload', byteSize: 1000 },
      MAX_RESUME_BYTES
    );
    expect(result.ok).toBe(false);
  });

  it('allows a missing or generic MIME type, deferring to the extension', () => {
    for (const contentType of [null, '', 'application/octet-stream']) {
      expect(
        validateResumeFile(
          { filename: 'resume.docx', contentType, byteSize: 1000 },
          MAX_RESUME_BYTES
        ).ok,
        String(contentType)
      ).toBe(true);
    }
  });

  it('has an explicit blocklist covering dangerous extensions', () => {
    for (const extension of ['exe', 'dll', 'ps1', 'bat', 'jar', 'apk']) {
      expect(BLOCKED_FILE_EXTENSIONS).toContain(extension as never);
    }
  });
});

describe('content signature sniffing', () => {
  it('accepts real PDF, DOCX, PNG and JPEG headers', () => {
    expect(hasPlausibleSignature(PDF_BYTES, 'pdf')).toBe(true);
    expect(hasPlausibleSignature(DOCX_BYTES, 'docx')).toBe(true);
    expect(hasPlausibleSignature(PNG_BYTES, 'png')).toBe(true);
    expect(hasPlausibleSignature(JPEG_BYTES, 'jpg')).toBe(true);
  });

  it('refuses a Windows executable disguised as a document', () => {
    expect(sniffContent(MZ_BYTES, 'pdf')).toMatch(/not accepted|does not match/i);
    expect(sniffContent(MZ_BYTES, 'docx')).toMatch(/not accepted|does not match/i);
  });

  it('refuses an ELF binary and a shell script', () => {
    expect(sniffContent(ELF_BYTES, 'pdf')).toMatch(/not accepted/i);
    const shebang = new Uint8Array([0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e, 0x2f]);
    expect(sniffContent(shebang, 'pdf')).toMatch(/not accepted/i);
  });

  it('refuses an executable hidden inside a ZIP-based DOCX', () => {
    expect(sniffContent(ZIP_EXE_BYTES, 'docx')).toMatch(/not accepted/i);
  });

  it('refuses content that does not match the claimed extension', () => {
    expect(sniffContent(PDF_BYTES, 'docx')).toMatch(/does not match/i);
    expect(sniffContent(PDF_BYTES, 'png')).toMatch(/does not match/i);
  });

  it('refuses an empty body but accepts genuine PDF content', () => {
    expect(sniffContent(new Uint8Array(0), 'pdf')).toMatch(/empty/i);
    expect(sniffContent(PDF_BYTES, 'pdf')).toBeNull();
  });
});

describe('image file validation', () => {
  it('accepts a valid PNG logo', () => {
    expect(
      validateImageFile(
        { filename: 'logo.png', contentType: 'image/png', byteSize: 5000 },
        2 * 1024 * 1024
      ).ok
    ).toBe(true);
  });

  it('rejects an SVG (which can carry script) and an oversized logo', () => {
    expect(
      validateImageFile(
        { filename: 'logo.svg', contentType: 'image/svg+xml', byteSize: 500 },
        2 * 1024 * 1024
      ).ok
    ).toBe(false);
    expect(
      validateImageFile(
        { filename: 'logo.png', contentType: 'image/png', byteSize: 3 * 1024 * 1024 },
        2 * 1024 * 1024
      ).ok
    ).toBe(false);
  });
});

describe('filename sanitisation', () => {
  it('strips directory components', () => {
    expect(sanitizeFilename('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeFilename('C:\\Users\\me\\cv.pdf')).toBe('cv.pdf');
  });

  it('strips control characters and shell metacharacters', () => {
    const cleaned = sanitizeFilename('re sum>e;.pdf');
    expect(cleaned).not.toContain('>');
    expect(cleaned.endsWith('.pdf')).toBe(true);
  });

  it('never produces a leading dot and falls back safely', () => {
    expect(sanitizeFilename('...secret.pdf').startsWith('.')).toBe(false);
    expect(sanitizeFilename('')).toBe('upload');
    expect(sanitizeFilename('///')).toBe('upload');
  });
});

describe('private storage keys', () => {
  it('generates an opaque, dated key from a UUID', () => {
    const key = buildStorageKey('pdf');
    expect(key).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(isSafeStorageKey(key)).toBe(true);
  });

  it('never includes a caller-supplied name', () => {
    const key = buildStorageKey('pdf');
    expect(key).not.toContain('john');
    expect(key.toLowerCase()).not.toContain('..');
  });

  it('rejects traversal, absolute paths and malformed keys', () => {
    for (const key of [
      '../../etc/passwd',
      '/etc/passwd',
      '2024/01/../../../etc/passwd',
      'not-a-key',
      '2024/01/short.pdf',
      '2024/01/0000.pdf\\..\\x',
    ]) {
      expect(isSafeStorageKey(key), key).toBe(false);
      expect(() => resolveStoragePath(key), key).toThrowError(StorageError);
    }
  });

  it('resolves a valid key to a path ending in the extension', () => {
    expect(resolveStoragePath(buildStorageKey('pdf')).endsWith('.pdf')).toBe(true);
  });
});
