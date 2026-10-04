import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Local-disk storage for resumes, verification documents, logos and generated
 * PDFs. Everything lives under UPLOAD_DIR, which is OUTSIDE /public and is
 * only ever read through an authenticated route handler.
 */

export function uploadRoot(): string {
  const configured = getEnv().UPLOAD_DIR;
  // `path.resolve` handles both absolute paths and paths relative to the app
  // root without a dynamic join (which trips Turbopack's tracing heuristic).
  return path.normalize(path.resolve(configured));
}

export const STORAGE_BUCKETS = [
  "resumes",
  "verification",
  "logos",
  "invoices",
  "built-resumes",
  "blog",
] as const;
export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

function assertBucket(bucket: string): asserts bucket is StorageBucket {
  if (!(STORAGE_BUCKETS as readonly string[]).includes(bucket)) {
    throw new AppError("Invalid storage bucket.", 400, "invalid_bucket");
  }
}

/** Creates the upload root (and bucket) if missing. */
export async function ensureBucket(bucket: StorageBucket): Promise<string> {
  assertBucket(bucket);
  const dir = path.join(uploadRoot(), bucket);
  await fs.mkdir(dir, { recursive: true, mode: 0o750 });
  return dir;
}

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

/** Sanitises a user-supplied filename for display/download only. */
export function safeFileName(name: string): string {
  return (
    path
      .basename(name)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .slice(0, 120) || "file"
  );
}

export type StoredFile = {
  storagePath: string; // relative to UPLOAD_DIR, e.g. "resumes/ab12.pdf"
  absolutePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};

export type ValidateOptions = {
  /** Allowed MIME types; the sniffed magic bytes must match one of them. */
  allowedMimes: string[];
  maxBytes: number;
};

/**
 * Sniffs the real file type from its magic bytes. We never trust the declared
 * MIME type or the extension on their own.
 */
export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  // OLE2 compound document - legacy .doc
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    )
  ) {
    return "application/msword";
  }
  // ZIP container - .docx (or any OOXML/zip file)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  const head = buffer.subarray(0, 256).toString("utf8").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
}

/**
 * Validates an uploaded file and returns its bytes.
 *
 * Three independent checks must agree:
 *   1. the declared browser MIME type is allow-listed,
 *   2. the file extension is allow-listed,
 *   3. the magic bytes actually sniff to an allow-listed type.
 * A renamed executable therefore cannot be stored.
 */
export async function readValidatedUpload(
  file: File,
  options: ValidateOptions,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new AppError("No file was provided.", 400, "no_file");
  }
  if (file.size <= 0) {
    throw new AppError("The selected file is empty.", 400, "empty_file");
  }
  if (file.size > options.maxBytes) {
    const mb = Math.round(options.maxBytes / (1024 * 1024));
    throw new AppError(
      `File is too large. Maximum size is ${mb} MB.`,
      413,
      "file_too_large",
    );
  }

  const declaredExt = path.extname(file.name).toLowerCase();
  const allowedExts = new Set(
    options.allowedMimes.map((m) => EXT_BY_MIME[m]).filter(Boolean) as string[],
  );
  if (allowedExts.size > 0 && !allowedExts.has(declaredExt)) {
    throw new AppError(
      `Unsupported file type. Allowed extensions: ${[...allowedExts].join(", ")}.`,
      415,
      "unsupported_file_type",
    );
  }
  if (!options.allowedMimes.includes(file.type)) {
    throw new AppError("That file type is not supported.", 415, "unsupported_file_type");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(buffer);

  if (!sniffed || !options.allowedMimes.includes(sniffed)) {
    throw new AppError(
      "The file contents do not match a supported document type.",
      415,
      "invalid_file_contents",
    );
  }

  return { buffer, mimeType: sniffed };
}

/**
 * Writes a validated file to disk under a random name and returns both the
 * relative path (stored in the database) and the absolute path.
 */
export async function storeValidatedFile(
  bucket: StorageBucket,
  buffer: Buffer,
  mimeType: string,
): Promise<StoredFile> {
  const dir = await ensureBucket(bucket);
  const ext = EXT_BY_MIME[mimeType] ?? "";
  const fileName = `${Date.now().toString(36)}-${randomBytes(12).toString("hex")}${ext}`;
  const absolutePath = path.join(dir, fileName);

  await fs.writeFile(absolutePath, buffer, { mode: 0o640 });

  return {
    storagePath: path.posix.join(bucket, fileName),
    absolutePath,
    originalName: fileName,
    mimeType,
    sizeBytes: buffer.byteLength,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  };
}

/**
 * Resolves a stored relative path to an absolute one, refusing anything that
 * escapes the upload root (path traversal).
 */
export async function resolveStoredPath(storagePath: string): Promise<string> {
  const root = uploadRoot();
  const absolute = path.resolve(root, storagePath);
  const normalisedRoot = path.resolve(root);

  if (
    absolute !== normalisedRoot &&
    !absolute.startsWith(normalisedRoot + path.sep)
  ) {
    throw new AppError("Invalid file path.", 400, "invalid_path");
  }

  // Refuse symlink escapes when the target already exists.
  try {
    const real = await fs.realpath(absolute);
    const realRoot = await fs.realpath(normalisedRoot);
    if (!real.startsWith(realRoot + path.sep)) {
      throw new AppError("Invalid file path.", 400, "invalid_path");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    // ENOENT is fine - the caller will report "not found".
  }

  return absolute;
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  try {
    await fs.unlink(await resolveStoredPath(storagePath));
  } catch (error) {
    console.warn(`[storage] could not delete ${storagePath}:`, error);
  }
}