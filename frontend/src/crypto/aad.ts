/**
 * Additional authenticated data, ARCHITECTURE section 5.4. AAD is not secret. AES-GCM checks it
 * along with the ciphertext, so a blob only decrypts in the exact place it was created for.
 */
import { bytesToBase64, utf8Encode, type Bytes } from './encoding';
import { CryptoFormatError } from './errors';
import type { KdfParams } from './params';

export const RECORD_TYPES = ['LOGIN', 'CATEGORY'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface RecordRef {
  vaultId: string;
  recordId: string;
  recordType: RecordType;
}

// Lowercase canonical form only, so the same ID always produces the same AAD bytes.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function uuid(value: string): string {
  if (!UUID.test(value)) {
    throw new CryptoFormatError('Invalid identifier.');
  }
  return value;
}

export function dekWrapAad(vaultId: string, kdf: KdfParams): Bytes {
  return utf8Encode(
    [
      'securevault',
      '1',
      'dek-wrap',
      uuid(vaultId),
      'argon2id',
      kdf.memoryKib,
      kdf.iterations,
      kdf.parallelism,
      bytesToBase64(kdf.salt),
    ].join('|'),
  );
}

export function recordAad({ vaultId, recordId, recordType }: RecordRef): Bytes {
  if (!RECORD_TYPES.includes(recordType)) {
    throw new CryptoFormatError('Unknown record type.');
  }
  return utf8Encode(
    ['securevault', '1', 'record', uuid(vaultId), uuid(recordId), recordType].join('|'),
  );
}

export function settingsAad(vaultId: string): Bytes {
  return utf8Encode(['securevault', '1', 'settings', uuid(vaultId)].join('|'));
}
