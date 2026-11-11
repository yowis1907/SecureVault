// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { CryptoFormatError, DecryptionError, PayloadTooLargeError } from './errors';
import {
  decryptRecord,
  decryptSettings,
  encryptRecord,
  encryptSettings,
  type EncryptedBlob,
  type RecordRef,
} from './records';
import { flipBit } from './testdata/hex';

const vaultId = '0b7e5a52-5f0e-4bd3-9f43-2a5d3c8e1f00';
let dek: CryptoKey;

beforeAll(async () => {
  // Records only need a DEK; how it is wrapped is tested in vault-keys.test.ts.
  dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
});

function ref(recordType: RecordRef['recordType'] = 'LOGIN'): RecordRef {
  return { vaultId, recordId: crypto.randomUUID(), recordType };
}

describe('record round trip', () => {
  it.each([
    ['ASCII', { title: 'Example', username: 'alice', password: 'hunter2!' }],
    ['Unicode', { title: 'Ünïcödé 密码 🔐', notes: 'şifre\nnew line' }],
    ['empty values', { title: '', urls: [], tags: [], favorite: false, notes: '' }],
  ])('returns the original value for %s', async (_, value) => {
    const r = ref();
    expect(await decryptRecord(dek, r, await encryptRecord(dek, r, value))).toEqual(value);
  });

  it('accepts the largest value that fits and rejects one byte more', async () => {
    // JSON of {"n":"..."} is 8 bytes plus the string; 65280 bytes padded minus the 4-byte length.
    const largest = { n: 'a'.repeat(65276 - 8) };
    const r = ref();
    const blob = await encryptRecord(dek, r, largest);
    expect(blob.ciphertext).toHaveLength(65280 + 16);
    expect(await decryptRecord(dek, r, blob)).toEqual(largest);

    await expect(encryptRecord(dek, r, { n: 'a'.repeat(65276 - 7) })).rejects.toThrow(
      PayloadTooLargeError,
    );
  });

  it('hides exact length: ciphertext is a 256-byte bucket plus the 16-byte tag', async () => {
    const short = await encryptRecord(dek, ref(), { p: 'a' });
    const longer = await encryptRecord(dek, ref(), { p: 'a'.repeat(200) });
    expect(short.ciphertext).toHaveLength(256 + 16);
    expect(longer.ciphertext).toHaveLength(256 + 16);
  });

  it('produces different ciphertext for the same value', async () => {
    const r = ref();
    const a = await encryptRecord(dek, r, { p: 'same' });
    const b = await encryptRecord(dek, r, { p: 'same' });
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it('uses a unique 12-byte nonce for each of 2,000 encryptions', async () => {
    const r = ref();
    const nonces = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const { nonce } = await encryptRecord(dek, r, { i });
      expect(nonce).toHaveLength(12);
      nonces.add(nonce.join(','));
    }
    expect(nonces.size).toBe(2000);
  });
});

describe('record tampering and relocation', () => {
  let r: RecordRef;
  let blob: EncryptedBlob;

  beforeAll(async () => {
    r = ref();
    blob = await encryptRecord(dek, r, { password: 'secret' });
  });

  it.each([
    ['the ciphertext', 'ciphertext', 0],
    ['the authentication tag', 'ciphertext', 256 + 15],
    ['the nonce', 'nonce', 11],
  ] as const)('fails when a bit is flipped in %s', async (_, field, index) => {
    const tampered = { ...blob, [field]: flipBit(blob[field], index) };
    await expect(decryptRecord(dek, r, tampered)).rejects.toThrow(DecryptionError);
  });

  it('fails under another record ID, so records cannot be swapped', async () => {
    await expect(decryptRecord(dek, { ...r, recordId: crypto.randomUUID() }, blob)).rejects.toThrow(
      DecryptionError,
    );
  });

  it('fails under another record type', async () => {
    await expect(decryptRecord(dek, { ...r, recordType: 'CATEGORY' }, blob)).rejects.toThrow(
      DecryptionError,
    );
  });

  it('fails under another vault ID', async () => {
    const otherVault = { ...r, vaultId: '1c8f6b63-6a1f-4ce4-8a54-3b6e4d9f2a11' };
    await expect(decryptRecord(dek, otherVault, blob)).rejects.toThrow(DecryptionError);
  });

  it('fails with a different key', async () => {
    const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await expect(decryptRecord(otherKey, r, blob)).rejects.toThrow(DecryptionError);
  });

  it('refuses an unknown crypto version', async () => {
    await expect(decryptRecord(dek, r, { ...blob, cryptoVersion: 2 })).rejects.toThrow(
      CryptoFormatError,
    );
  });

  it.each([
    ['a short nonce', { nonce: new Uint8Array(11) }],
    ['ciphertext shorter than a tag', { ciphertext: new Uint8Array(15) }],
    ['ciphertext over the limit', { ciphertext: new Uint8Array(65537) }],
  ])('refuses %s', async (_, change) => {
    await expect(decryptRecord(dek, r, { ...blob, ...change })).rejects.toThrow(CryptoFormatError);
  });
});

describe('settings', () => {
  it('round-trips and stays within the 8,192-byte server limit', async () => {
    const settings = { autoLockMinutes: 5, clipboardClearSeconds: 30 };
    const blob = await encryptSettings(dek, vaultId, settings);
    expect(blob.ciphertext.length).toBeLessThanOrEqual(8192);
    expect(await decryptSettings(dek, vaultId, blob)).toEqual(settings);
  });

  it('cannot be opened as a record, or a record as settings', async () => {
    const r = ref();
    const record = await encryptRecord(dek, r, { a: 1 });
    await expect(decryptSettings(dek, vaultId, record)).rejects.toThrow(DecryptionError);
    const settings = await encryptSettings(dek, vaultId, { a: 1 });
    await expect(decryptRecord(dek, r, settings)).rejects.toThrow(DecryptionError);
  });
});

describe('authentic ciphertext with unexpected contents', () => {
  // Possible only for someone holding the key, but the reader must still fail closed.
  async function sealRaw(r: RecordRef, plaintext: Uint8Array<ArrayBuffer>): Promise<EncryptedBlob> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const additionalData = new TextEncoder().encode(
      `securevault|1|record|${r.vaultId}|${r.recordId}|${r.recordType}`,
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData },
      dek,
      plaintext,
    );
    return { cryptoVersion: 1, nonce, ciphertext: new Uint8Array(ciphertext) };
  }

  it('rejects contents that are not JSON', async () => {
    const r = ref();
    const padded = new Uint8Array(256);
    padded.set([0, 0, 0, 3, 0x6e, 0x6f, 0x21]);
    await expect(decryptRecord(dek, r, await sealRaw(r, padded))).rejects.toThrow(
      CryptoFormatError,
    );
  });

  it('rejects contents with broken padding', async () => {
    const r = ref();
    await expect(decryptRecord(dek, r, await sealRaw(r, new Uint8Array(100)))).rejects.toThrow(
      CryptoFormatError,
    );
  });
});
