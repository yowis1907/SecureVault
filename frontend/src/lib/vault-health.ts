/**
 * Security dashboard analysis. Runs on decrypted entries in the browser; nothing here is sent to
 * the server or any third party.
 */
import type { LoginEntry } from '../vault-session/model';
import type { Strength } from './strength';

export interface HealthReport {
  total: number;
  weak: LoginEntry[];
  /** Groups of two or more entries sharing one password. */
  reused: LoginEntry[][];
  /** Passwords not changed for more than a year. */
  old: LoginEntry[];
  empty: LoginEntry[];
  favorites: number;
  /** Share of entries with a password that is neither weak nor reused, 0 to 100. */
  score: number;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export async function analyze(
  logins: LoginEntry[],
  estimate: (password: string, inputs: string[]) => Promise<Strength>,
  now: number = Date.now(),
): Promise<HealthReport> {
  const withPassword = logins.filter((l) => l.password.length > 0);
  const empty = logins.filter((l) => l.password.length === 0);

  const byPassword = new Map<string, LoginEntry[]>();
  for (const login of withPassword) {
    byPassword.set(login.password, [...(byPassword.get(login.password) ?? []), login]);
  }
  const reused = [...byPassword.values()].filter((group) => group.length > 1);
  const reusedIds = new Set(reused.flat().map((l) => l.id));

  const weak: LoginEntry[] = [];
  for (const login of withPassword) {
    const result = await estimate(login.password, [login.title, login.username, login.email]);
    if (result.score < 3) weak.push(login);
  }
  const weakIds = new Set(weak.map((l) => l.id));

  const old = withPassword.filter((l) => now - Date.parse(l.passwordUpdatedAt) > YEAR_MS);
  const healthy = withPassword.filter((l) => !weakIds.has(l.id) && !reusedIds.has(l.id)).length;

  return {
    total: logins.length,
    weak,
    reused,
    old,
    empty,
    favorites: logins.filter((l) => l.favorite).length,
    score: withPassword.length === 0 ? 100 : Math.round((healthy / withPassword.length) * 100),
  };
}
