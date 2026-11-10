/**
 * Length hiding, ARCHITECTURE section 5.5: a 4-byte big-endian length, the data, then zero bytes
 * up to the next multiple of 256. The server then learns only a size bucket.
 */
import type { Bytes } from './encoding';
import { CryptoFormatError, PayloadTooLargeError } from './errors';

const BLOCK = 256;
const HEADER = 4;

function paddedLength(dataLength: number): number {
  return Math.ceil((HEADER + dataLength) / BLOCK) * BLOCK;
}

export function pad(data: Uint8Array, maxPaddedLength: number): Bytes {
  const total = paddedLength(data.length);
  if (total > maxPaddedLength) {
    throw new PayloadTooLargeError('This item is too large to save.');
  }
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, data.length, false);
  out.set(data, HEADER);
  return out;
}

/** Returns a view of the data inside `padded`. Every structural rule is checked. */
export function unpad(padded: Bytes): Bytes {
  const invalid = new CryptoFormatError('Invalid padding.');
  if (padded.length === 0 || padded.length % BLOCK !== 0) {
    throw invalid;
  }
  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(
    0,
    false,
  );
  if (paddedLength(length) !== padded.length) {
    throw invalid;
  }
  for (let i = HEADER + length; i < padded.length; i++) {
    if (padded[i] !== 0) {
      throw invalid;
    }
  }
  return padded.subarray(HEADER, HEADER + length);
}
