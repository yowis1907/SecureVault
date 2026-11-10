// @vitest-environment node
/**
 * Known-answer tests for the primitives SecureVault relies on, checked against published vectors.
 * These confirm the platform's Web Crypto behaves as the standards say before our code builds on it.
 */
import { describe, expect, it } from 'vitest';
import { utf8Encode } from './encoding';
import { kekFromArgon2Output } from './kdf';
import { hex, toHex } from './testdata/hex';

async function hkdf(
  ikm: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

describe('HKDF-SHA-256, RFC 5869 appendix A', () => {
  it('test case 1', async () => {
    const okm = await hkdf(
      hex('0b'.repeat(22)),
      hex('000102030405060708090a0b0c'),
      hex('f0f1f2f3f4f5f6f7f8f9'),
      42,
    );
    expect(toHex(okm)).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('test case 3, empty salt and info as SecureVault uses an empty salt', async () => {
    const okm = await hkdf(hex('0b'.repeat(22)), new Uint8Array(0), new Uint8Array(0), 42);
    expect(toHex(okm)).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
    );
  });
});

describe('AES-256-GCM, McGrew and Viega GCM specification test cases', () => {
  async function encrypt(
    key: Uint8Array<ArrayBuffer>,
    iv: Uint8Array<ArrayBuffer>,
    plaintext: Uint8Array<ArrayBuffer>,
    additionalData: Uint8Array<ArrayBuffer>,
  ): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    const out = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
      cryptoKey,
      plaintext,
    );
    return toHex(new Uint8Array(out));
  }

  it('test case 13, empty plaintext', async () => {
    expect(
      await encrypt(new Uint8Array(32), new Uint8Array(12), new Uint8Array(0), new Uint8Array(0)),
    ).toBe('530f8afbc74536b9a963b4f1c4cb738b');
  });

  it('test case 14, one zero block', async () => {
    expect(
      await encrypt(new Uint8Array(32), new Uint8Array(12), new Uint8Array(16), new Uint8Array(0)),
    ).toBe('cea7403d4d606b6e074ec5d3baf39d18' + 'd0d1c8a799996bf0265b98b5d48ab919');
  });

  it('test case 16, with additional authenticated data', async () => {
    const ciphertextAndTag = await encrypt(
      hex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308'),
      hex('cafebabefacedbaddecaf888'),
      hex(
        'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72' +
          '1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39',
      ),
      hex('feedfacedeadbeeffeedfacedeadbeefabaddad2'),
    );
    expect(ciphertextAndTag).toBe(
      '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa' +
        '8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662' +
        '76fc6ece0f4e1768cddf8853bb2d551b',
    );
  });
});

describe('KEK derivation', () => {
  it('is HKDF-SHA-256 with an empty salt and the securevault/v1/kek label', async () => {
    const argon2Output = Uint8Array.from({ length: 32 }, (_, i) => i);
    const expectedKeyBytes = await hkdf(
      new Uint8Array(argon2Output),
      new Uint8Array(0),
      utf8Encode('securevault/v1/kek'),
      32,
    );

    // The KEK is non-extractable, so compare it through what it produces when wrapping a known key.
    const kek = await kekFromArgon2Output(argon2Output);
    const knownKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(32).fill(7),
      'AES-GCM',
      true,
      ['encrypt'],
    );
    const iv = new Uint8Array(12);
    const wrapped = await crypto.subtle.wrapKey('raw', knownKey, kek, { name: 'AES-GCM', iv });

    const reference = await crypto.subtle.importKey('raw', expectedKeyBytes, 'AES-GCM', false, [
      'encrypt',
    ]);
    const expected = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      reference,
      new Uint8Array(32).fill(7),
    );
    expect(toHex(new Uint8Array(wrapped))).toBe(toHex(new Uint8Array(expected)));
    expect(kek.extractable).toBe(false);
    expect(kek.usages.toSorted()).toEqual(['unwrapKey', 'wrapKey']);
  });
});
