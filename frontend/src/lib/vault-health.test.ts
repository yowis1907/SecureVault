// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyLogin, type LoginEntry } from '../vault-session/model';
import type { Strength } from './strength';
import { analyze } from './vault-health';

function entry(title: string, password: string, extra: Partial<LoginEntry> = {}): LoginEntry {
  return {
    ...emptyLogin(),
    title,
    password,
    id: crypto.randomUUID(),
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    passwordUpdatedAt: '2026-11-01T00:00:00Z',
    ...extra,
  };
}

// A stand-in estimator so the test is about the analysis, not about zxcvbn's word lists.
const estimate = (password: string): Promise<Strength> =>
  Promise.resolve({
    score: password.startsWith('weak') ? 1 : 4,
    crackTime: '',
    warning: null,
    suggestions: [],
  });

describe('vault health analysis', () => {
  it('finds weak, reused, old, and empty passwords and scores the rest', async () => {
    const shared = 'strong-shared-password';
    const logins = [
      entry('A', shared),
      entry('B', shared, { favorite: true }),
      entry('C', 'weak-password'),
      entry('D', 'strong-unique', { passwordUpdatedAt: '2025-01-01T00:00:00Z' }),
      entry('E', ''),
    ];
    const report = await analyze(logins, estimate, Date.parse('2026-11-10T00:00:00Z'));

    expect(report.total).toBe(5);
    expect(report.weak.map((l) => l.title)).toEqual(['C']);
    expect(report.reused.map((g) => g.map((l) => l.title))).toEqual([['A', 'B']]);
    expect(report.old.map((l) => l.title)).toEqual(['D']);
    expect(report.empty.map((l) => l.title)).toEqual(['E']);
    expect(report.favorites).toBe(1);
    // Of the four with a password, only D is neither weak nor reused.
    expect(report.score).toBe(25);
  });

  it('scores an empty vault as healthy', async () => {
    expect((await analyze([], estimate)).score).toBe(100);
  });
});
