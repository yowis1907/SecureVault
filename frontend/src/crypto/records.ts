/**
 * Record and settings encryption, ARCHITECTURE sections 5.4 and 5.5.
 * The whole value is one AES-256-GCM blob, never individual fields.
 */
import { recordAad, settingsAad, type RecordRef } from './aad';
import { utf8Decode, utf8Encode, type Bytes } from './encoding';
import { CryptoFormatError, DecryptionError } from './errors';
import { pad, unpad } from './padding';
import { assertCryptoVersion, CRYPTO_VERSION } from './params';
import { randomBytes } from './random';

export type { RecordRef, RecordType } from './aad';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
/** Server limits on stored ciphertext, including the tag (API and database specifications). */
export const MAX_RECORD_CIPHERTEXT = 65536;
export const MAX_SETTINGS_CIPHERTEXT = 8192;

export interface EncryptedBlob {
  cryptoVersion: number;
  nonce: Bytes;
  ciphertext: Bytes;
}

/** Largest padded size whose ciphertext still fits the limit: a whole number of 256-byte blocks. */
function maxPadded(maxCiphertext: number): number {
  return Math.floor((maxCiphertext - TAG_BYTES) / 256) * 256;
}

async function seal(
  dek: CryptoKey,
  additionalData: Bytes,
  value: unknown,
  maxCiphertext: number,
): Promise<EncryptedBlob> {
  const json = utf8Encode(JSON.stringify(value));
  const padded = pad(json, maxPadded(maxCiphertext));
  const nonce = randomBytes(NONCE_BYTES);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData, tagLength: 128 },
      dek,
      padded,
    );
    return { cryptoVersion: CRYPTO_VERSION, nonce, ciphertext: new Uint8Array(ciphertext) };
  } finally {
    json.fill(0);
    padded.fill(0);
  }
}

async function open(
  dek: CryptoKey,
  additionalData: Bytes,
  blob: EncryptedBlob,
  maxCiphertext: number,
): Promise<unknown> {
  assertCryptoVersion(blob.cryptoVersion);
  if (
    blob.nonce.length !== NONCE_BYTES ||
    blob.ciphertext.length < TAG_BYTES ||
    blob.ciphertext.length > maxCiphertext
  ) {
    throw new CryptoFormatError('Invalid encrypted item.');
  }
  let plaintext: Bytes;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: blob.nonce, additionalData, tagLength: 128 },
        dek,
        blob.ciphertext,
      ),
    );
  } catch {
    throw new DecryptionError();
  }
  try {
    return JSON.parse(utf8Decode(unpad(plaintext))) as unknown;
  } catch (error) {
    if (error instanceof CryptoFormatError) {
      throw error;
    }
    throw new CryptoFormatError('Invalid item contents.');
  } finally {
    plaintext.fill(0);
  }
}

/** Returns parsed JSON as `unknown`. The caller validates it against the record schema. */
export function encryptRecord(
  dek: CryptoKey,
  ref: RecordRef,
  value: unknown,
): Promise<EncryptedBlob> {
  return seal(dek, recordAad(ref), value, MAX_RECORD_CIPHERTEXT);
}

export function decryptRecord(
  dek: CryptoKey,
  ref: RecordRef,
  blob: EncryptedBlob,
): Promise<unknown> {
  return open(dek, recordAad(ref), blob, MAX_RECORD_CIPHERTEXT);
}

export function encryptSettings(
  dek: CryptoKey,
  vaultId: string,
  value: unknown,
): Promise<EncryptedBlob> {
  return seal(dek, settingsAad(vaultId), value, MAX_SETTINGS_CIPHERTEXT);
}

export function decryptSettings(
  dek: CryptoKey,
  vaultId: string,
  blob: EncryptedBlob,
): Promise<unknown> {
  return open(dek, settingsAad(vaultId), blob, MAX_SETTINGS_CIPHERTEXT);
}
