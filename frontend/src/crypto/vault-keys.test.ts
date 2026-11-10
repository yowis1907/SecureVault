// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { argon2idHashWasm } from './argon2';
import { CryptoFormatError, UnlockError } from './errors';
import { decryptRecord, encryptRecord } from './records';
import { flipBit } from './testdata/hex';
import {
  changeMasterPassword,
  createVaultKeys,
  unlockVault,
  type VaultKeyMaterial,
} from './vault-keys';

const vaultId = '0b7e5a52-5f0e-4bd3-9f43-2a5d3c8e1f00';
const otherVaultId = '1c8f6b63-6a1f-4ce4-8a54-3b6e4d9f2a11';
const password = 'test master password one';

async function create(): Promise<{ material: VaultKeyMaterial; dek: CryptoKey }> {
  return createVaultKeys(password, vaultId, argon2idHashWasm);
}

describe('creating a vault', () => {
  it('produces key material in the documented shape', async () => {
    const { material } = await create();
    expect(material.vaultId).toBe(vaultId);
    expect(material.cryptoVersion).toBe(1);
    expect(material.wrappedDek).toHaveLength(48);
    expect(material.wrapNonce).toHaveLength(12);
    expect(material.kdf).toMatchObject({ memoryKib: 65536, iterations: 3, parallelism: 1 });
  });

  it('returns a session DEK that cannot be exported', async () => {
    const { dek } = await create();
    expect(dek.extractable).toBe(false);
    expect(dek.usages.toSorted()).toEqual(['decrypt', 'encrypt']);
    await expect(crypto.subtle.exportKey('raw', dek)).rejects.toThrow();
  });

  it('uses a fresh salt, nonce, and DEK for every vault', async () => {
    const a = await create();
    const b = await create();
    expect(a.material.kdf.salt).not.toEqual(b.material.kdf.salt);
    expect(a.material.wrapNonce).not.toEqual(b.material.wrapNonce);
    expect(a.material.wrappedDek).not.toEqual(b.material.wrappedDek);
  });
});

describe('unlocking', () => {
  it('works with the right password and returns a non-extractable DEK', async () => {
    const { material, dek } = await create();
    const unlocked = await unlockVault(password, material, argon2idHashWasm);
    expect(unlocked.extractable).toBe(false);

    const ref = { vaultId, recordId: crypto.randomUUID(), recordType: 'LOGIN' as const };
    const blob = await encryptRecord(dek, ref, { title: 'example' });
    expect(await decryptRecord(unlocked, ref, blob)).toEqual({ title: 'example' });
  });

  it('fails with the generic unlock error for a wrong password', async () => {
    const { material } = await create();
    await expect(unlockVault('wrong password', material, argon2idHashWasm)).rejects.toThrow(
      UnlockError,
    );
  });

  it.each([
    ['the first byte of the wrapped key', 'wrappedDek', 0],
    ['the authentication tag', 'wrappedDek', 47],
    ['the nonce', 'wrapNonce', 5],
  ] as const)('fails when a bit is flipped in %s', async (_, field, index) => {
    const { material } = await create();
    const tampered = { ...material, [field]: flipBit(material[field], index) };
    await expect(unlockVault(password, tampered, argon2idHashWasm)).rejects.toThrow(UnlockError);
  });

  it('fails when the key material is moved to another vault ID', async () => {
    const { material } = await create();
    await expect(
      unlockVault(password, { ...material, vaultId: otherVaultId }, argon2idHashWasm),
    ).rejects.toThrow(UnlockError);
  });

  it('fails when the server changes the salt', async () => {
    const { material } = await create();
    const kdf = { ...material.kdf, salt: flipBit(material.kdf.salt, 0) };
    await expect(unlockVault(password, { ...material, kdf }, argon2idHashWasm)).rejects.toThrow(
      UnlockError,
    );
  });

  it('refuses weakened KDF parameters without deriving anything', async () => {
    const { material } = await create();
    const argon2 = vi.fn(argon2idHashWasm);
    const kdf = { ...material.kdf, memoryKib: 8192 };
    await expect(unlockVault(password, { ...material, kdf }, argon2)).rejects.toThrow(
      CryptoFormatError,
    );
    expect(argon2).not.toHaveBeenCalled();
  });

  it('refuses an unknown crypto version without deriving anything', async () => {
    const { material } = await create();
    const argon2 = vi.fn(argon2idHashWasm);
    await expect(unlockVault(password, { ...material, cryptoVersion: 2 }, argon2)).rejects.toThrow(
      CryptoFormatError,
    );
    expect(argon2).not.toHaveBeenCalled();
  });

  it('refuses a malformed vault ID as a format error, without deriving anything', async () => {
    const { material } = await create();
    const argon2 = vi.fn(argon2idHashWasm);
    await expect(
      unlockVault(password, { ...material, vaultId: 'not-a-uuid' }, argon2),
    ).rejects.toThrow(CryptoFormatError);
    expect(argon2).not.toHaveBeenCalled();
  });

  it.each([
    ['a short wrapped key', 'wrappedDek', 47],
    ['a long nonce', 'wrapNonce', 13],
  ] as const)('refuses %s', async (_, field, length) => {
    const { material } = await create();
    const malformed = { ...material, [field]: new Uint8Array(length) };
    await expect(unlockVault(password, malformed, argon2idHashWasm)).rejects.toThrow(
      CryptoFormatError,
    );
  });
});

describe('changing the master password', () => {
  it('lets the new password unlock, rejects the old one, and keeps records readable', async () => {
    const { material, dek } = await create();
    const ref = { vaultId, recordId: crypto.randomUUID(), recordType: 'LOGIN' as const };
    const blob = await encryptRecord(dek, ref, { title: 'kept' });

    const changed = await changeMasterPassword(
      password,
      'test master password two',
      material,
      argon2idHashWasm,
    );

    expect(changed.kdf.salt).not.toEqual(material.kdf.salt);
    expect(changed.vaultId).toBe(vaultId);
    await expect(unlockVault(password, changed, argon2idHashWasm)).rejects.toThrow(UnlockError);
    const unlocked = await unlockVault('test master password two', changed, argon2idHashWasm);
    expect(await decryptRecord(unlocked, ref, blob)).toEqual({ title: 'kept' });
  });

  it('requires the current password to be correct', async () => {
    const { material } = await create();
    await expect(
      changeMasterPassword('wrong', 'test master password two', material, argon2idHashWasm),
    ).rejects.toThrow(UnlockError);
  });
});
