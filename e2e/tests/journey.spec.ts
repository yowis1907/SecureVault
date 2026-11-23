import { expect, test } from '@playwright/test';
import { newAccount, register, signIn, unlock } from './flows';
import {
  apiLogs,
  canary,
  databaseDump,
  forms,
  recordCspViolations,
  recordTraffic,
} from './support';

/**
 * The core journey from the test plan, in a real browser against the real stack, with a unique
 * canary in the master password and in every entry field. The zero-knowledge claim is checked
 * where it matters: in every request and response, every database row, and the server logs.
 */

test('register, store, refresh, edit, and delete without the server seeing any secret', async ({
  page,
  context,
}) => {
  const traffic = recordTraffic(context);
  const cspViolations = await recordCspViolations(context);
  const account = newAccount();
  const entry = {
    title: canary('title'),
    username: canary('user'),
    email: canary('entrymail'),
    password: canary('password'),
    url: `https://${canary('site')}.example`,
    tag: canary('tag'),
    notes: canary('notes'),
  };
  const changedPassword = canary('changed');

  await register(page, account);
  await signIn(page, account);
  await unlock(page, account);
  await expect(page.getByRole('heading', { name: 'Your vault is empty' })).toBeVisible();

  // Trusted Types are enforced: the Argon2 worker started, and a plain string at a script
  // sink is refused. Browsers without Trusted Types skip only the refusal check.
  const sink = await page.evaluate(() => {
    if (!('trustedTypes' in window)) return 'no trusted types';
    try {
      document.createElement('div').innerHTML = '<b>x</b>';
      return 'allowed';
    } catch (error) {
      return (error as Error).name;
    }
  });
  test.info().annotations.push({ type: 'trusted types', description: sink });
  console.log(`Trusted Types probe: ${sink}`);
  expect(['TypeError', 'no trusted types']).toContain(sink);

  // Create.
  await page.getByRole('link', { name: 'Add your first login' }).click();
  await page.getByLabel('Name', { exact: true }).fill(entry.title);
  await page.getByLabel('Username', { exact: true }).fill(entry.username);
  await page.getByLabel('Email', { exact: true }).fill(entry.email);
  await page.getByLabel('Password', { exact: true }).fill(entry.password);
  await page.getByLabel('Websites', { exact: true }).fill(entry.url);
  await page.getByLabel('Tags', { exact: true }).fill(entry.tag);
  await page.getByLabel('Notes', { exact: true }).fill(entry.notes);
  await page.getByRole('button', { name: 'Add login' }).click();
  await expect(page.getByRole('heading', { level: 2, name: entry.title })).toBeVisible();

  // A refresh drops the key and decrypted data, so the vault must be unlocked again.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vault locked' })).toBeVisible();
  await unlock(page, account);
  await expect(page.getByRole('heading', { level: 2, name: entry.title })).toBeVisible();
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByText(entry.password)).toBeVisible();
  await expect(page.getByText(entry.notes)).toBeVisible();
  await expect(page.getByRole('link', { name: entry.url })).toHaveAttribute('rel', /noreferrer/);

  // Edit.
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Password', { exact: true }).fill(changedPassword);
  await page.getByRole('button', { name: 'Save changes' }).click();
  // The editor has its own "Show password" toggle, so wait until the detail view is back.
  await expect(page).not.toHaveURL(/\/edit$/);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByText(changedPassword)).toBeVisible();

  // The database, checked while the encrypted record exists.
  const dump = databaseDump();
  expect(dump, 'positive control: the account email is stored').toContain(account.email);
  const secrets = [account.masterPassword, changedPassword, ...Object.values(entry)];
  for (const secret of secrets) {
    for (const form of forms(secret)) {
      expect(dump.includes(form), `database contains ${secret.slice(0, 14)}`).toBe(false);
    }
  }

  // Delete.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete login' }).click();
  await expect(page.getByText('Login deleted')).toBeVisible();
  await expect(page.getByText('No logins yet. Add one to get started.')).toBeVisible();

  // Sign out, then confirm the vault is no longer reachable.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.goto('/app/vault');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Every request and response the browser exchanged with the app.
  const exchanged = await traffic.all();
  const api = exchanged.filter((e) => e.url.includes('/api/v1/'));
  expect(api.length, 'requests were captured').toBeGreaterThan(10);
  expect(
    api.some((e) => e.requestBody.includes(account.accountPassword)),
    'positive control: the account password is sent at sign-in, as designed',
  ).toBe(true);
  for (const secret of secrets) {
    const leaks = exchanged.filter(
      (e) =>
        e.url.includes(secret) || e.requestBody.includes(secret) || e.responseBody.includes(secret),
    );
    expect(
      leaks.map((e) => e.url),
      `${secret.slice(0, 14)} must not reach the network`,
    ).toEqual([]);
  }

  const logs = apiLogs();
  for (const secret of [...secrets, account.accountPassword]) {
    expect(logs.includes(secret), `logs contain ${secret.slice(0, 14)}`).toBe(false);
  }

  // The deliberate innerHTML probe above is the only violation allowed.
  expect(cspViolations.filter((v) => !v.startsWith('require-trusted-types-for'))).toEqual([]);
  expect(cspViolations.length, cspViolations.join('\n')).toBeLessThanOrEqual(1);
});
