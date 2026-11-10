// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { argon2idHashWasm, type Argon2idFunction } from './argon2';
import { utf8Decode } from './encoding';
import { CryptoFormatError } from './errors';
import { deriveKek, normalizeMasterPassword } from './kdf';
import { DEFAULT_KDF, newKdfParams } from './params';

describe('master password normalization', () => {
  it('applies NFKC so composed and decomposed input give the same bytes', () => {
    const composed = 'café';
    const decomposed = 'café';
    expect(normalizeMasterPassword(composed)).toEqual(normalizeMasterPassword(decomposed));
  });

  it('folds compatibility characters such as ligatures and full-width forms', () => {
    expect(utf8Decode(normalizeMasterPassword('ﬁle'))).toBe('file');
    expect(utf8Decode(normalizeMasterPassword('ＡＢ'))).toBe('AB');
  });

  it('does not change case or trim spaces', () => {
    expect(utf8Decode(normalizeMasterPassword(' Secret '))).toBe(' Secret ');
  });
});

describe('deriveKek', () => {
  it('rejects out-of-range parameters before running Argon2id', async () => {
    const argon2 = vi.fn(argon2idHashWasm);
    const weak = { ...DEFAULT_KDF, iterations: 1, salt: new Uint8Array(16) };
    await expect(deriveKek('password', weak, argon2)).rejects.toThrow(CryptoFormatError);
    expect(argon2).not.toHaveBeenCalled();
  });

  it('rejects an Argon2 result of the wrong length', async () => {
    const argon2 = vi.fn(() => Promise.resolve(new Uint8Array(16)));
    await expect(deriveKek('password', newKdfParams(), argon2)).rejects.toThrow(CryptoFormatError);
  });

  it('passes the normalized password bytes to Argon2id, then clears its copy', async () => {
    let seen = '';
    let passed: Uint8Array | undefined;
    const argon2: Argon2idFunction = (password, kdf) => {
      seen = utf8Decode(password);
      passed = password;
      return argon2idHashWasm(password, kdf);
    };
    await deriveKek('ﬁ', newKdfParams(), argon2);
    expect(seen).toBe('fi');
    expect(Array.from(passed ?? [1])).toEqual([0, 0]);
  });

  it('works when Argon2 takes ownership of the password buffer, as the worker does', async () => {
    const transferring: Argon2idFunction = (password, kdf) =>
      argon2idHashWasm(structuredClone(password, { transfer: [password.buffer] }), kdf);
    await expect(deriveKek('password', newKdfParams(), transferring)).resolves.toBeDefined();
  });

  it('gives a non-extractable key that can only wrap and unwrap', async () => {
    const kek = await deriveKek('password', newKdfParams(), argon2idHashWasm);
    expect(kek.extractable).toBe(false);
    expect(kek.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(kek.usages.toSorted()).toEqual(['unwrapKey', 'wrapKey']);
  });
});
