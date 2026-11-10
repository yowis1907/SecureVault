// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, entropyBits, generatePassword, randomInt } from './generator';

describe('randomInt', () => {
  it('stays in range and reaches every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
      seen.add(n);
    }
    expect(seen.size).toBe(7);
  });

  it('rejects invalid ranges', () => {
    for (const bad of [0, -1, 1.5, 2 ** 32 + 1]) {
      expect(() => randomInt(bad)).toThrow(RangeError);
    }
  });
});

describe('generatePassword', () => {
  it('honours the length and includes every chosen character type', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_OPTIONS, length: 12 });
      expect(pw).toHaveLength(12);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('uses only the chosen types and can leave out look-alike characters', () => {
    const digitsOnly = {
      ...DEFAULT_OPTIONS,
      lowercase: false,
      uppercase: false,
      symbols: false,
      length: 64,
    };
    expect(generatePassword(digitsOnly)).toMatch(/^[0-9]{64}$/);
    for (let i = 0; i < 100; i++) {
      expect(
        generatePassword({ ...DEFAULT_OPTIONS, avoidAmbiguous: true, length: 64 }),
      ).not.toMatch(/[Il1O0o|`'"]/);
    }
  });

  it('clamps the length and refuses an empty character set', () => {
    expect(generatePassword({ ...DEFAULT_OPTIONS, length: 2 })).toHaveLength(8);
    expect(generatePassword({ ...DEFAULT_OPTIONS, length: 500 })).toHaveLength(128);
    expect(() =>
      generatePassword({
        ...DEFAULT_OPTIONS,
        lowercase: false,
        uppercase: false,
        digits: false,
        symbols: false,
      }),
    ).toThrow(RangeError);
  });

  it('does not repeat itself', () => {
    const results = new Set(Array.from({ length: 500 }, () => generatePassword(DEFAULT_OPTIONS)));
    expect(results.size).toBe(500);
  });

  it('reports entropy from length and alphabet size', () => {
    expect(
      entropyBits({
        ...DEFAULT_OPTIONS,
        lowercase: true,
        uppercase: false,
        digits: false,
        symbols: false,
        length: 10,
      }),
    ).toBe(47);
  });
});
