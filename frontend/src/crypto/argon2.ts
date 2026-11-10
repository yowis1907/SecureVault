import { argon2id } from 'hash-wasm';
import type { Bytes } from './encoding';
import { CryptoFormatError } from './errors';
import { validateKdfParams, type KdfParams } from './params';

/** 32 bytes, used as HKDF input keying material. */
export const ARGON2_OUTPUT_BYTES = 32;

/**
 * Computes Argon2id. Implemented by hash-wasm here, and by a Web Worker wrapper around this same
 * function in the app, so the interface stays responsive during the slow derivation.
 */
export type Argon2idFunction = (password: Bytes, kdf: KdfParams) => Promise<Bytes>;

export const argon2idHashWasm: Argon2idFunction = async (password, kdf) => {
  validateKdfParams(kdf);
  // hash-wasm rejects empty input itself. Fail here with our own error type instead.
  if (password.length === 0) {
    throw new CryptoFormatError('A password is required.');
  }
  const result = await argon2id({
    password,
    salt: kdf.salt,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
    memorySize: kdf.memoryKib,
    hashLength: ARGON2_OUTPUT_BYTES,
    outputType: 'binary',
  });
  const copy = new Uint8Array(result);
  result.fill(0);
  return copy;
};
