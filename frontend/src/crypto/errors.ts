/**
 * Error messages are fixed text. They never include passwords, keys, plaintext, or ciphertext.
 */

/**
 * The vault key could not be unwrapped. A wrong master password and tampered key material are
 * deliberately indistinguishable: AES-GCM only reports that authentication failed.
 */
export class UnlockError extends Error {
  override readonly name = 'UnlockError';
  constructor() {
    super('The master password is incorrect, or the vault data is damaged.');
  }
}

/** A record or settings blob failed authentication: tampered, moved, or the wrong key. */
export class DecryptionError extends Error {
  override readonly name = 'DecryptionError';
  constructor() {
    super('This item could not be decrypted. It may be damaged or altered.');
  }
}

/** Input is structurally invalid: bad encoding, length, version, or parameter range. */
export class CryptoFormatError extends Error {
  override readonly name: string = 'CryptoFormatError';
}

/** A backup file failed authentication: wrong passphrase, or the file was damaged or altered. */
export class BackupOpenError extends Error {
  override readonly name = 'BackupOpenError';
  constructor() {
    super('The backup passphrase is incorrect, or the file is damaged.');
  }
}

/** Argon2id could not run, for example because the device ran out of memory. */
export class KeyDerivationError extends Error {
  override readonly name = 'KeyDerivationError';
  constructor() {
    super('Key derivation failed. Close other tabs and try again.');
  }
}

/** A value is too large to encrypt within the server's size limit. */
export class PayloadTooLargeError extends CryptoFormatError {
  override readonly name = 'PayloadTooLargeError';
}
