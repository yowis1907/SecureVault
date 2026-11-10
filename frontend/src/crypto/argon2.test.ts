// @vitest-environment node
/**
 * Cross-implementation check. The vectors were produced by Bouncy Castle, a separate Java
 * implementation, and the backend test suite recomputes them. Here they are checked against
 * hash-wasm, which the app uses, and @noble/hashes, a third implementation used only in tests.
 */
import { argon2id as nobleArgon2id } from '@noble/hashes/argon2.js';
import { describe, expect, it } from 'vitest';
import { argon2idHashWasm } from './argon2';
import { CryptoFormatError } from './errors';
import { DEFAULT_KDF } from './params';
import vectorFile from './testdata/argon2id-vectors.json';
import { hex, toHex } from './testdata/hex';

const vectors = vectorFile.vectors.map((v) => ({
  ...v,
  password: hex(v.passwordHex),
  kdf: {
    algorithm: 'ARGON2ID' as const,
    memoryKib: v.memoryKib,
    iterations: v.iterations,
    parallelism: v.parallelism,
    salt: hex(v.saltHex),
  },
}));

// hash-wasm refuses an empty password, so that vector is checked through noble only.
const nonEmpty = vectors.filter((v) => v.password.length > 0);

describe('Argon2id through hash-wasm', () => {
  it('has vectors to check', () => {
    expect(nonEmpty.length).toBeGreaterThanOrEqual(7);
  });

  it('rejects an empty password with our own error', async () => {
    await expect(
      argon2idHashWasm(new Uint8Array(0), { ...DEFAULT_KDF, salt: new Uint8Array(16) }),
    ).rejects.toThrow(CryptoFormatError);
  });

  it.each(nonEmpty.map((v) => [v.name, v] as const))(
    'matches Bouncy Castle: %s',
    async (_, v) => {
      expect(toHex(await argon2idHashWasm(v.password, v.kdf))).toBe(v.outputHex);
    },
    60_000,
  );

  it('refuses out-of-range parameters before hashing', async () => {
    await expect(
      argon2idHashWasm(new Uint8Array(1), {
        ...DEFAULT_KDF,
        memoryKib: 1024,
        salt: new Uint8Array(16),
      }),
    ).rejects.toThrow(CryptoFormatError);
  });
});

describe('Argon2id through @noble/hashes', () => {
  // Pure JavaScript is slow at 64 MiB, so check a representative subset.
  const subset = vectors.filter((v) =>
    [
      'ascii, spec defaults',
      'unicode, spec defaults',
      'empty password, spec defaults',
      'two lanes',
    ].includes(v.name),
  );

  it('has the subset', () => {
    expect(subset).toHaveLength(4);
  });

  it.each(subset.map((v) => [v.name, v] as const))(
    'matches Bouncy Castle: %s',
    (_, v) => {
      const out = nobleArgon2id(v.password, v.kdf.salt, {
        m: v.kdf.memoryKib,
        t: v.kdf.iterations,
        p: v.kdf.parallelism,
        dkLen: 32,
      });
      expect(toHex(out)).toBe(v.outputHex);
    },
    180_000,
  );
});
