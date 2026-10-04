import bcrypt from "bcryptjs";

/**
 * Password hashing.
 *
 * Primary: argon2id via the native `@node-rs/argon2` binding.
 * Fallback: bcryptjs (pure JS) when the native module is unavailable, e.g. on
 * a platform without a prebuilt binary. Hashes are self-describing, so both
 * families can coexist in the same users table.
 */

type Argon2 = typeof import("@node-rs/argon2");

let argon2Module: Argon2 | null | undefined;

async function loadArgon2(): Promise<Argon2 | null> {
  if (argon2Module !== undefined) return argon2Module;
  try {
    argon2Module = await import("@node-rs/argon2");
    return argon2Module;
  } catch (error) {
    console.warn(
      "[auth] @node-rs/argon2 unavailable - falling back to bcryptjs.",
      error instanceof Error ? error.message : error,
    );
    argon2Module = null;
    return null;
  }
}

export const ARGON2_PREFIX = "$argon2";
const BCRYPT_ROUNDS = 12;

/**
 * Argon2id is the default algorithm of `@node-rs/argon2` (`Algorithm.Argon2id`
 * === 2), so we do not pass it explicitly: `Algorithm` is an ambient const
 * enum, which cannot be referenced under `isolatedModules`. Verified by the
 * `$argon2id$` PHC prefix on every produced hash.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB - OWASP recommended minimum
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  const argon2 = await loadArgon2();
  if (argon2) {
    return argon2.hash(password, ARGON2_OPTIONS);
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  hash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!hash) return false;

  if (hash.startsWith(ARGON2_PREFIX)) {
    const argon2 = await loadArgon2();
    if (!argon2) return false;
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }

  return false;
}

/** True when a stored hash should be upgraded to the current algorithm. */
export function needsRehash(hash: string | null | undefined): boolean {
  if (!hash) return false;
  if (hash.startsWith(ARGON2_PREFIX)) return false;
  return true;
}
