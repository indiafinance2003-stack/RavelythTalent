import 'server-only';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '@/lib/config';

/**
 * Private file storage for Ravelyth Talent (resumes, avatars, company logos).
 *
 * Design goals (see §28 of the brief):
 *  - A `StorageDriver` interface so object storage (S3/R2) can be swapped in
 *    during deployment without touching any service. The local driver is the
 *    development default and is explicitly NOT presented as production-safe:
 *    `storageStatus()` reports `localDriver` so this is visible.
 *  - Files live OUTSIDE the Next.js `public/` tree, so no URL can serve them
 *    and no static path can leak one.
 *  - Storage keys are generated entirely server-side from a random UUID plus a
 *    validated extension. No part of a user-supplied filename ever reaches a
 *    path, so a crafted `../../etc/passwd` name is impossible by construction.
 *  - Every read re-validates the key and refuses anything that escapes the
 *    storage root (path traversal defence).
 *  - Writes use owner-only permissions (0600); directories are 0700.
 *
 * Downloads are served only through an authenticated route that checks
 * authorization first and then records an access log entry.
 */

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface StoredObject {
  storageKey: string;
  byteSize: number;
  checksumSha256: string;
  contentType: string;
}

/** Pluggable backend. An object-storage driver can be added in Part 3. */
export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/** Absolute storage root, resolved once per process. */
export function storageRoot(): string {
  return path.resolve(process.cwd(), config.PORTAL_STORAGE_DIR);
}

/**
 * Builds an opaque storage key: `<yyyy>/<mm>/<uuid>.<ext>`.
 * URL-safe and free of any user-controlled characters.
 */
export function buildStorageKey(extension: string, now: Date = new Date()): string {
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  if (safeExtension.length === 0) {
    throw new StorageError('A storage key requires a file extension.');
  }
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${crypto.randomUUID()}.${safeExtension}`;
}

const STORAGE_KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/;

/** Validates a storage key's shape before it is ever joined to a path. */
export function isSafeStorageKey(key: string): boolean {
  if (typeof key !== 'string' || !STORAGE_KEY_PATTERN.test(key)) return false;
  if (key.includes('..') || key.includes('\\') || key.includes('\0')) return false;
  return true;
}

/**
 * Resolves a storage key to an absolute path, refusing anything that escapes
 * the private root (path traversal / absolute-path injection).
 */
export function resolveStoragePath(key: string): string {
  if (!isSafeStorageKey(key)) {
    throw new StorageError('Invalid storage key.');
  }
  const root = storageRoot();
  const absolute = path.resolve(root, key);
  const rootWithSeparator = root.endsWith(path.sep) ? root : root + path.sep;
  if (!absolute.startsWith(rootWithSeparator)) {
    throw new StorageError('Invalid storage key.');
  }
  return absolute;
}


/** Local filesystem driver. Suitable for development and single-node deploys. */
class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    if (body.byteLength === 0) {
      throw new StorageError('Refusing to store an empty file.');
    }
    const absolute = resolveStoragePath(key);
    await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await fs.writeFile(absolute, body, { mode: 0o600 });
    return {
      storageKey: key,
      byteSize: body.byteLength,
      checksumSha256: crypto.createHash('sha256').update(body).digest('hex'),
      contentType,
    };
  }

  async get(key: string): Promise<Buffer> {
    const absolute = resolveStoragePath(key);
    try {
      return await fs.readFile(absolute);
    } catch {
      throw new StorageError('The stored file is no longer available.');
    }
  }

  async delete(key: string): Promise<void> {
    const absolute = resolveStoragePath(key);
    try {
      await fs.unlink(absolute);
    } catch {
      // Already gone: deletion is idempotent.
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(resolveStoragePath(key));
      return true;
    } catch {
      return false;
    }
  }
}

let driver: StorageDriver | undefined;

function getDriver(): StorageDriver {
  if (!driver) driver = new LocalStorageDriver();
  return driver;
}

/** Replaces the driver. Used by tests and by a future object-storage adapter. */
export function setStorageDriver(next: StorageDriver | undefined): void {
  driver = next;
}

export function storageDriver(): StorageDriver {
  return getDriver();
}

/** Stores a file and returns its opaque key and checksum. */
export async function putFile(
  extension: string,
  body: Buffer,
  contentType: string
): Promise<StoredObject> {
  return getDriver().put(buildStorageKey(extension), body, contentType);
}

/**
 * Reads a private file. ONLY an authorized server route may call this; the
 * identity check always happens before this function is reached.
 */
export async function getFile(storageKey: string): Promise<Buffer> {
  return getDriver().get(storageKey);
}

export async function deleteFile(storageKey: string): Promise<void> {
  return getDriver().delete(storageKey);
}

export async function fileExists(storageKey: string): Promise<boolean> {
  return getDriver().exists(storageKey);
}

/**
 * Reports whether private storage is usable, so a misconfigured deployment is
 * visible rather than silently failing every upload.
 */
export async function storageStatus(): Promise<{
  driver: string;
  configured: boolean;
  writable: boolean;
  directory: string;
  /** True when running on the local driver, which is not production-safe. */
  localDriver: boolean;
}> {
  const root = storageRoot();
  const configured = config.PORTAL_STORAGE_DIR.length > 0;
  const active = getDriver();
  try {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    await fs.access(root);
    return {
      driver: active.name,
      configured,
      writable: true,
      directory: root,
      localDriver: active.name === 'local',
    };
  } catch {
    return {
      driver: active.name,
      configured,
      writable: false,
      directory: root,
      localDriver: active.name === 'local',
    };
  }
}
