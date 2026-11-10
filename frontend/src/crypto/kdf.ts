/**
 * Master password to KEK, ARCHITECTURE section 5.2:
 * NFKC, UTF-8, Argon2id, then HKDF-SHA-256 with an empty salt and the label securevault/v1/kek.
 */
import type { Argon2idFunction } from './argon2';
import { utf8Encode, type Bytes } from './encoding';
import { CryptoFormatError } from './errors';
import { ARGON2_OUTPUT_BYTES, validateKdfParams, type KdfParams } from './params';

const KEK_INFO = utf8Encode('securevault/v1/kek');

/** NFKC so the same password typed on different systems gives the same bytes. Case is kept. */
export function normalizeMasterPassword(masterPassword: string): Bytes {
  return utf8Encode(masterPassword.normalize('NFKC'));
}

/** HKDF step only. Exported so known-answer tests can check it without running Argon2id. */
export async function kekFromArgon2Output(argon2Output: Bytes): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', argon2Output, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: KEK_INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

export async function deriveKek(
  masterPassword: string,
  kdf: KdfParams,
  argon2: Argon2idFunction,
): Promise<CryptoKey> {
  validateKdfParams(kdf);
  const password = normalizeMasterPassword(masterPassword);
  let output: Bytes | undefined;
  try {
    output = await argon2(password, kdf);
    if (output.length !== ARGON2_OUTPUT_BYTES) {
      throw new CryptoFormatError('Unexpected key derivation output.');
    }
    return await kekFromArgon2Output(output);
  } finally {
    // Best effort only: JavaScript cannot guarantee other copies are gone from memory.
    // A worker-based Argon2 transfers the buffer away, leaving a detached, zero-length view here.
    if (password.byteLength > 0) {
      password.fill(0);
    }
    output?.fill(0);
  }
}
