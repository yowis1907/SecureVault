/**
 * Encrypted backup files, ARCHITECTURE section 5.8.
 *
 * A JSON file with a header (format, version, KDF parameters with salt, nonce) and one
 * AES-256-GCM ciphertext of the padded contents. The key comes from a backup passphrase through
 * Argon2id and HKDF labelled securevault/v1/backup, separate from the vault key. The header is
 * authenticated as AAD, so changing any part of it, including the KDF parameters, breaks
 * decryption. Plaintext export is deliberately not offered.
 */
import type { Argon2idFunction } from './argon2';
import { base64ToBytes, bytesToBase64, utf8Decode, utf8Encode, type Bytes } from './encoding';
import { BackupOpenError, CryptoFormatError } from './errors';
import { deriveBackupKey } from './kdf';
import { pad, unpad } from './padding';
import { newKdfParams, validateKdfParams, type KdfParams } from './params';
import { randomBytes } from './random';

const FORMAT = 'securevault-backup';
const VERSION = 1;
const NONCE_BYTES = 12;
/** Far above any real vault (5,000 items at the server's limit), but bounded. */
const MAX_PADDED = 64 * 1024 * 1024;

const notABackup = () => new CryptoFormatError('This is not a SecureVault backup file.');

/**
 * The exact bytes authenticated as AAD. Built from the parsed values in a fixed order, so the
 * order of keys in the file does not matter, but every value does.
 */
function headerAad(kdf: KdfParams, nonce: Bytes): Bytes {
  const canonical = JSON.stringify({
    format: FORMAT,
    version: VERSION,
    kdf: {
      algorithm: kdf.algorithm,
      memoryKib: kdf.memoryKib,
      iterations: kdf.iterations,
      parallelism: kdf.parallelism,
      salt: bytesToBase64(kdf.salt),
    },
    nonce: bytesToBase64(nonce),
  });
  return utf8Encode(`securevault|1|backup|${canonical}`);
}

/** Returns the file's text. The caller offers it for download; nothing is sent anywhere. */
export async function createBackup(
  passphrase: string,
  contents: unknown,
  argon2: Argon2idFunction,
): Promise<string> {
  const kdf = newKdfParams();
  const nonce = randomBytes(NONCE_BYTES);
  const key = await deriveBackupKey(passphrase, kdf, argon2);
  const plaintext = pad(utf8Encode(JSON.stringify(contents)), MAX_PADDED);
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: headerAad(kdf, nonce), tagLength: 128 },
      key,
      plaintext,
    );
    return JSON.stringify({
      header: {
        format: FORMAT,
        version: VERSION,
        kdf: {
          algorithm: kdf.algorithm,
          memoryKib: kdf.memoryKib,
          iterations: kdf.iterations,
          parallelism: kdf.parallelism,
          salt: bytesToBase64(kdf.salt),
        },
        nonce: bytesToBase64(nonce),
      },
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    });
  } finally {
    plaintext.fill(0);
  }
}

function field(object: unknown, name: string): unknown {
  return typeof object === 'object' && object !== null
    ? (object as Record<string, unknown>)[name]
    : undefined;
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw notABackup();
  return value;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw notABackup();
  return value;
}

/** Checks the file's structure, then the KDF limits, before any key is derived. */
function parse(fileText: string): { kdf: KdfParams; nonce: Bytes; ciphertext: Bytes } {
  let file: unknown;
  try {
    file = JSON.parse(fileText);
  } catch {
    throw notABackup();
  }
  const header = field(file, 'header');
  if (field(header, 'format') !== FORMAT) throw notABackup();
  if (field(header, 'version') !== VERSION) {
    throw new CryptoFormatError('This backup was made by an unsupported version.');
  }
  const k = field(header, 'kdf');
  const algorithm = field(k, 'algorithm');
  if (algorithm !== 'ARGON2ID') {
    throw new CryptoFormatError('Key derivation parameters are outside the allowed range.');
  }
  const kdf: KdfParams = {
    algorithm,
    memoryKib: integer(field(k, 'memoryKib')),
    iterations: integer(field(k, 'iterations')),
    parallelism: integer(field(k, 'parallelism')),
    salt: base64ToBytes(text(field(k, 'salt'))),
  };
  validateKdfParams(kdf);
  const nonce = base64ToBytes(text(field(header, 'nonce')));
  const ciphertext = base64ToBytes(text(field(file, 'ciphertext')));
  if (
    nonce.length !== NONCE_BYTES ||
    ciphertext.length < 16 ||
    ciphertext.length > MAX_PADDED + 16
  ) {
    throw notABackup();
  }
  return { kdf, nonce, ciphertext };
}

/** Returns the parsed contents as `unknown`; the caller validates their shape. */
export async function openBackup(
  fileText: string,
  passphrase: string,
  argon2: Argon2idFunction,
): Promise<unknown> {
  const { kdf, nonce, ciphertext } = parse(fileText);
  const key = await deriveBackupKey(passphrase, kdf, argon2);
  let plaintext: Bytes;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: headerAad(kdf, nonce), tagLength: 128 },
        key,
        ciphertext,
      ),
    );
  } catch {
    throw new BackupOpenError();
  }
  try {
    return JSON.parse(utf8Decode(unpad(plaintext))) as unknown;
  } catch (error) {
    if (error instanceof CryptoFormatError) throw error;
    throw new CryptoFormatError('The backup contents are not valid.');
  } finally {
    plaintext.fill(0);
  }
}
