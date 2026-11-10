// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode } from './encoding';
import { CryptoFormatError } from './errors';

describe('base64', () => {
  it('round-trips every byte value', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(base64ToBytes(bytesToBase64(all))).toEqual(all);
  });

  it('matches RFC 4648 test vectors', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [text, encoded] of cases) {
      expect(bytesToBase64(utf8Encode(text))).toBe(encoded);
      expect(utf8Decode(base64ToBytes(encoded))).toBe(text);
    }
  });

  it.each([
    ['missing padding', 'Zg'],
    ['URL-safe alphabet', 'a-_b'],
    ['whitespace', 'Zm9v Zm9v'],
    ['non-zero unused bits', 'Zh=='],
    ['wrong length', 'Zm9vY'],
  ])('rejects %s', (_, input) => {
    expect(() => base64ToBytes(input)).toThrow(CryptoFormatError);
  });
});

describe('utf8', () => {
  it('rejects invalid UTF-8 instead of substituting characters', () => {
    expect(() => utf8Decode(new Uint8Array([0xff, 0xfe]))).toThrow(CryptoFormatError);
  });
});
