// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CryptoFormatError, PayloadTooLargeError } from './errors';
import { pad, unpad } from './padding';

const MAX = 65280;

describe('padding to 256-byte buckets', () => {
  it.each([
    [0, 256],
    [1, 256],
    [252, 256],
    [253, 512],
    [508, 512],
    [509, 768],
    [MAX - 4, MAX],
  ])('pads %i bytes of data to %i bytes', (length, expected) => {
    const data = new Uint8Array(length).fill(0x61);
    const padded = pad(data, MAX);
    expect(padded).toHaveLength(expected);
    expect(unpad(padded)).toEqual(data);
  });

  it('rejects data that would exceed the limit', () => {
    expect(() => pad(new Uint8Array(MAX - 3), MAX)).toThrow(PayloadTooLargeError);
  });

  it('stores the length big-endian in the first four bytes', () => {
    const padded = pad(new Uint8Array(258), MAX);
    expect(Array.from(padded.subarray(0, 4))).toEqual([0, 0, 1, 2]);
  });

  it('rejects a length that is not a multiple of 256', () => {
    expect(() => unpad(new Uint8Array(255))).toThrow(CryptoFormatError);
    expect(() => unpad(new Uint8Array(0))).toThrow(CryptoFormatError);
  });

  it('rejects a declared length longer than the buffer', () => {
    const padded = pad(new Uint8Array(10), MAX);
    padded[3] = 253;
    expect(() => unpad(padded)).toThrow(CryptoFormatError);
  });

  it('rejects non-zero padding bytes', () => {
    const padded = pad(new Uint8Array(10), MAX);
    padded[255] = 1;
    expect(() => unpad(padded)).toThrow(CryptoFormatError);
  });

  it('rejects more padding than the canonical amount', () => {
    const padded = new Uint8Array(512);
    padded[3] = 10;
    expect(() => unpad(padded)).toThrow(CryptoFormatError);
  });
});
