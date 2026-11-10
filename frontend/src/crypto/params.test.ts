// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CryptoFormatError } from './errors';
import {
  assertCryptoVersion,
  DEFAULT_KDF,
  KDF_LIMITS,
  newKdfParams,
  validateKdfParams,
  type KdfParams,
} from './params';

const valid: KdfParams = { ...DEFAULT_KDF, salt: new Uint8Array(16) };

describe('KDF parameters', () => {
  it('uses the specified defaults: 64 MiB, 3 iterations, 1 lane, 16-byte salt', () => {
    const params = newKdfParams();
    expect(params).toMatchObject({
      algorithm: 'ARGON2ID',
      memoryKib: 65536,
      iterations: 3,
      parallelism: 1,
    });
    expect(params.salt).toHaveLength(16);
    expect(() => {
      validateKdfParams(params);
    }).not.toThrow();
  });

  it('accepts the inclusive limits', () => {
    for (const memoryKib of [KDF_LIMITS.memoryKib.min, KDF_LIMITS.memoryKib.max]) {
      for (const iterations of [KDF_LIMITS.iterations.min, KDF_LIMITS.iterations.max]) {
        for (const parallelism of [KDF_LIMITS.parallelism.min, KDF_LIMITS.parallelism.max]) {
          expect(() => {
            validateKdfParams({ ...valid, memoryKib, iterations, parallelism });
          }).not.toThrow();
        }
      }
    }
  });

  it.each<[string, Partial<KdfParams>]>([
    ['memory below the floor', { memoryKib: 65535 }],
    ['memory above the ceiling', { memoryKib: 1048577 }],
    ['iterations below the floor', { iterations: 2 }],
    ['iterations above the ceiling', { iterations: 11 }],
    ['zero lanes', { parallelism: 0 }],
    ['too many lanes', { parallelism: 5 }],
    ['fractional memory', { memoryKib: 65536.5 }],
    ['NaN iterations', { iterations: Number.NaN }],
    ['short salt', { salt: new Uint8Array(15) }],
    ['long salt', { salt: new Uint8Array(17) }],
  ])('rejects %s', (_, change) => {
    expect(() => {
      validateKdfParams({ ...valid, ...change });
    }).toThrow(CryptoFormatError);
  });

  it('rejects any algorithm other than Argon2id', () => {
    const params = { ...valid, algorithm: 'ARGON2I' } as unknown as KdfParams;
    expect(() => {
      validateKdfParams(params);
    }).toThrow(CryptoFormatError);
  });

  it('generates a different salt every time', () => {
    const salts = new Set(Array.from({ length: 1000 }, () => newKdfParams().salt.join(',')));
    expect(salts.size).toBe(1000);
  });
});

describe('crypto version', () => {
  it('accepts version 1 and rejects anything else, with no fallback', () => {
    expect(() => {
      assertCryptoVersion(1);
    }).not.toThrow();
    for (const version of [0, 2, -1, 1.5, Number.NaN]) {
      expect(() => {
        assertCryptoVersion(version);
      }).toThrow(CryptoFormatError);
    }
  });
});
