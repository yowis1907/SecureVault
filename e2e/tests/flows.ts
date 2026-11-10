import { expect, type Page } from '@playwright/test';
import { canary, latestEmailLink } from './support';

/** User flows shared by the specs. Each account is new and uses only generated test values. */
export interface Account {
  email: string;
  accountPassword: string;
  masterPassword: string;
}

export function newAccount(): Account {
  return {
    email: `${canary('mail')}@example.test`,
    accountPassword: canary('account'),
    masterPassword: canary('master'),
  };
}

export async function register(page: Page, account: Account): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Account password', { exact: true }).fill(account.accountPassword);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Master password', { exact: true }).fill(account.masterPassword);
  await page.getByLabel('Confirm master password', { exact: true }).fill(account.masterPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create vault' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await latestEmailLink(account.email));
  await expect(page.getByText('Email confirmed')).toBeVisible();
  // The token is removed from the address bar once read.
  expect(page.url()).not.toContain('token');
}

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Account password', { exact: true }).fill(account.accountPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Vault locked' })).toBeVisible();
}

export async function unlock(page: Page, account: Account): Promise<void> {
  await page.getByLabel('Master password', { exact: true }).fill(account.masterPassword);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('button', { name: /Vault unlocked/ })).toBeVisible();
}
