/**
 * Password generation from the platform CSPRNG. Characters are picked with rejection sampling,
 * because `random % n` makes some characters slightly more likely than others.
 */

export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leaves out characters that are easy to misread: I l 1 O 0 and similar. */
  avoidAmbiguous: boolean;
}

export const DEFAULT_OPTIONS: GeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
};

export const LENGTH_LIMITS = { min: 8, max: 128 } as const;

const SETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&()*+,-./:;<=>?@[]^_{}~',
} as const;

const AMBIGUOUS = new Set('Il1O0o|`\'"');

/** A uniform integer in [0, max) from crypto.getRandomValues. */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) {
    throw new RangeError('max must be an integer from 1 to 2^32');
  }
  // Reject values from the incomplete last block so every result is equally likely.
  const limit = Math.floor(2 ** 32 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % max;
  }
}

function pools(options: GeneratorOptions): string[] {
  return (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((name) => options[name])
    .map((name) =>
      Array.from(SETS[name])
        .filter((c) => !options.avoidAmbiguous || !AMBIGUOUS.has(c))
        .join(''),
    );
}

export function generatePassword(options: GeneratorOptions): string {
  const selected = pools(options);
  if (selected.length === 0) {
    throw new RangeError('Choose at least one character type.');
  }
  const length = Math.min(
    Math.max(Math.trunc(options.length), LENGTH_LIMITS.min),
    LENGTH_LIMITS.max,
  );
  const all = selected.join('');
  // One character from each chosen type, so the result meets the usual site rules.
  const chars = selected.map((pool) => pool[randomInt(pool.length)] ?? '');
  while (chars.length < length) {
    chars.push(all[randomInt(all.length)] ?? '');
  }
  // Fisher-Yates shuffle, so the guaranteed characters are not always at the start.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] ?? '', chars[i] ?? ''];
  }
  return chars.join('');
}

/** Upper bound on strength: length times log2 of the alphabet size. */
export function entropyBits(options: GeneratorOptions): number {
  const size = pools(options).join('').length;
  return size === 0 ? 0 : Math.round(options.length * Math.log2(size));
}
