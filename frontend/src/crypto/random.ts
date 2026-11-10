import type { Bytes } from './encoding';

/** Cryptographically secure random bytes from the platform's CSPRNG. */
export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}
