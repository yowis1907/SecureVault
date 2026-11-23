import { expect, test } from '@playwright/test';
import { newAccount, register, signIn, unlock } from './flows';

// The wrong-master-password check lives in two-factor.spec.ts, which shares its account.

/** Behaviour only a real browser can show: cross-tab locking and session handling. */

test('locking in one tab locks every other tab', async ({ context }) => {
  const account = newAccount();
  const first = await context.newPage();
  await register(first, account);
  await signIn(first, account);
  await unlock(first, account);

  // A second tab shares the session cookie but must unlock on its own: the key is per tab.
  const second = await context.newPage();
  await second.goto('/unlock');
  await expect(second.getByRole('heading', { name: 'Vault locked' })).toBeVisible();
  await unlock(second, account);

  await first.getByRole('button', { name: /Vault unlocked/ }).click();

  await expect(first.getByRole('heading', { name: 'Vault locked' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Vault locked' })).toBeVisible();
});
