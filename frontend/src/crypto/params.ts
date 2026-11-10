import type { Bytes } from './encoding';
import { CryptoFormatError } from './errors';
import { randomBytes } from './random';

/** Argon2id output length, used as HKDF input keying material. */
export const ARGON2_OUTPUT_BYTES = 32;

/** The only supported format. Unknown versions are rejected; there is no fallback. */
export const CRYPTO_VERSION = 1;

export interface KdfParams {
  algorithm: 'ARGON2ID';
  memoryKib: number;
  iterations: number;
  parallelism: number;
  salt: Bytes;
}

/** ARCHITECTURE section 5.2. The same limits are enforced by the server and the database. */
export const KDF_LIMITS = {
  memoryKib: { min: 65536, max: 1048576 },
  iterations: { min: 3, max: 10 },
  parallelism: { min: 1, max: 4 },
  saltBytes: 16,
} as const;

export const DEFAULT_KDF = {
  algorithm: 'ARGON2ID',
  memoryKib: 65536,
  iterations: 3,
  parallelism: 1,
} as const satisfies Omit<KdfParams, 'salt'>;

/** Default parameters with a fresh random salt, for a new vault or a master password change. */
export function newKdfParams(): KdfParams {
  return { ...DEFAULT_KDF, salt: randomBytes(KDF_LIMITS.saltBytes) };
}

function inRange(value: number, limits: { min: number; max: number }): boolean {
  return Number.isSafeInteger(value) && value >= limits.min && value <= limits.max;
}

/**
 * Runs before any derivation. Parameters come from the server, which must not be able to make
 * the client derive a weak key or exhaust its memory.
 */
export function validateKdfParams(params: KdfParams): void {
  if (
    // The type already says ARGON2ID, but this value arrives from the server at runtime.
    (params.algorithm as string) !== 'ARGON2ID' ||
    !inRange(params.memoryKib, KDF_LIMITS.memoryKib) ||
    !inRange(params.iterations, KDF_LIMITS.iterations) ||
    !inRange(params.parallelism, KDF_LIMITS.parallelism) ||
    params.salt.length !== KDF_LIMITS.saltBytes
  ) {
    throw new CryptoFormatError('Key derivation parameters are outside the allowed range.');
  }
}

export function assertCryptoVersion(version: number): void {
  if (version !== CRYPTO_VERSION) {
    throw new CryptoFormatError('Unsupported encryption format version.');
  }
}
