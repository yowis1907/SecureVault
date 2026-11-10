/**
 * The data encryption key (DEK) and its wrapping, ARCHITECTURE sections 5.3 and 5.6.
 * The DEK encrypts records. The KEK, derived from the master password, only wraps the DEK.
 */
import { dekWrapAad } from './aad';
import type { Argon2idFunction } from './argon2';
import type { Bytes } from './encoding';
import { CryptoFormatError, UnlockError } from './errors';
import { deriveKek } from './kdf';
import { assertCryptoVersion, CRYPTO_VERSION, newKdfParams, type KdfParams } from './params';
import { randomBytes } from './random';

const NONCE_BYTES = 12;
const WRAPPED_DEK_BYTES = 48; // 32-byte key plus 16-byte tag
const DEK_ALGORITHM = { name: 'AES-GCM', length: 256 } as const;
const DEK_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

/** What the server stores to let the user unlock. None of it is secret without the password. */
export interface VaultKeyMaterial {
  vaultId: string;
  cryptoVersion: number;
  kdf: KdfParams;
  wrappedDek: Bytes;
  wrapNonce: Bytes;
}

async function wrap(dek: CryptoKey, kek: CryptoKey, vaultId: string, kdf: KdfParams) {
  const wrapNonce = randomBytes(NONCE_BYTES);
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv: wrapNonce,
    additionalData: dekWrapAad(vaultId, kdf),
    tagLength: 128,
  });
  return { wrappedDek: new Uint8Array(wrapped), wrapNonce };
}

async function unwrap(
  material: VaultKeyMaterial,
  kek: CryptoKey,
  extractable: boolean,
): Promise<CryptoKey> {
  // Built outside the try, so a malformed ID stays a format error rather than "wrong password".
  const additionalData = dekWrapAad(material.vaultId, material.kdf);
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      material.wrappedDek,
      kek,
      {
        name: 'AES-GCM',
        iv: material.wrapNonce,
        additionalData,
        tagLength: 128,
      },
      DEK_ALGORITHM,
      extractable,
      DEK_USAGES,
    );
  } catch {
    throw new UnlockError();
  }
}

/** Every structural check runs before Argon2id, so bad input never costs a derivation. */
function checkMaterial(material: VaultKeyMaterial): void {
  assertCryptoVersion(material.cryptoVersion);
  dekWrapAad(material.vaultId, material.kdf);
  if (
    material.wrappedDek.length !== WRAPPED_DEK_BYTES ||
    material.wrapNonce.length !== NONCE_BYTES
  ) {
    throw new CryptoFormatError('Invalid vault key material.');
  }
}

/**
 * New vault: a random DEK wrapped under a KEK from the master password.
 * The DEK is extractable only for the single wrap. The returned session key comes from unwrapping,
 * so it is non-extractable: not even this app's own code can read its raw bytes.
 */
export async function createVaultKeys(
  masterPassword: string,
  vaultId: string,
  argon2: Argon2idFunction,
): Promise<{ material: VaultKeyMaterial; dek: CryptoKey }> {
  const kdf = newKdfParams();
  const kek = await deriveKek(masterPassword, kdf, argon2);
  const exportable = await crypto.subtle.generateKey(DEK_ALGORITHM, true, DEK_USAGES);
  const material: VaultKeyMaterial = {
    vaultId,
    cryptoVersion: CRYPTO_VERSION,
    kdf,
    ...(await wrap(exportable, kek, vaultId, kdf)),
  };
  const dek = await unwrap(material, kek, false);
  return { material, dek };
}

/** A wrong password and tampered material both end in the same UnlockError. */
export async function unlockVault(
  masterPassword: string,
  material: VaultKeyMaterial,
  argon2: Argon2idFunction,
): Promise<CryptoKey> {
  checkMaterial(material);
  const kek = await deriveKek(masterPassword, material.kdf, argon2);
  return unwrap(material, kek, false);
}

/**
 * Re-wraps the same DEK under a new password and a fresh salt. Records are untouched.
 * The DEK is extractable only inside this function, long enough to be wrapped again.
 */
export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
  material: VaultKeyMaterial,
  argon2: Argon2idFunction,
): Promise<VaultKeyMaterial> {
  checkMaterial(material);
  const currentKek = await deriveKek(currentPassword, material.kdf, argon2);
  const exportable = await unwrap(material, currentKek, true);
  const kdf = newKdfParams();
  const newKek = await deriveKek(newPassword, kdf, argon2);
  return {
    vaultId: material.vaultId,
    cryptoVersion: CRYPTO_VERSION,
    kdf,
    ...(await wrap(exportable, newKek, material.vaultId, kdf)),
  };
}
