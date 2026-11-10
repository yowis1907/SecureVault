/**
 * Local password strength estimation with zxcvbn-ts. Nothing is sent anywhere: the dictionaries are
 * bundled and loaded on first use, which keeps them out of the initial download.
 */
import type { ZxcvbnFactory } from '@zxcvbn-ts/core';

export interface Strength {
  /** 0 (very weak) to 4 (very strong). */
  score: 0 | 1 | 2 | 3 | 4;
  /** Rough time to guess offline against a slow hash, as plain text. */
  crackTime: string;
  warning: string | null;
  suggestions: string[];
}

export const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const;

let factory: Promise<ZxcvbnFactory> | null = null;

async function load(): Promise<ZxcvbnFactory> {
  const [core, common, en] = await Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]);
  return new core.ZxcvbnFactory({
    translations: en.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...en.dictionary },
  });
}

export async function estimateStrength(
  password: string,
  userInputs: string[] = [],
): Promise<Strength> {
  factory ??= load();
  const result = (await factory).check(password, userInputs.filter(Boolean));
  return {
    score: result.score,
    crackTime: result.crackTimes.offlineSlowHashingXPerSecond.display,
    warning: result.feedback.warning,
    suggestions: result.feedback.suggestions,
  };
}
