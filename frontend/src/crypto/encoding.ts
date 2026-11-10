import { CryptoFormatError } from './errors';

/** Bytes backed by a regular ArrayBuffer, which is what Web Crypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
// fatal: invalid UTF-8 throws instead of silently becoming replacement characters.
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8Encode(text: string): Bytes {
  return encoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new CryptoFormatError('Invalid UTF-8.');
  }
}

/** Standard base64 with padding, RFC 4648 section 4. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Strict decoding: one canonical encoding per value. Without the round-trip check, two different
 * strings could decode to the same bytes, which matters when values are compared or put into AAD.
 */
export function base64ToBytes(text: string): Bytes {
  if (!BASE64.test(text)) {
    throw new CryptoFormatError('Invalid base64.');
  }
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytesToBase64(bytes) !== text) {
    throw new CryptoFormatError('Invalid base64.');
  }
  return bytes;
}
