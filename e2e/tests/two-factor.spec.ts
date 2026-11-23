import { expect, test, type Page } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';
import { newAccount, register, signIn, unlock, type Account } from './flows';
import { databaseDump, forms } from './support';

/**
 * Account sign-in security in a real browser: a wrong master password is refused, and two-factor
 * sign-in works end to end with a real TOTP code and a recovery code. One account for all of it,
 * which keeps the suite within the hourly sign-up limit.
 */

async function passwordStep(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Account password', { exact: true }).fill(account.accountPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Two-factor sign-in' })).toBeVisible();
}

async function signOutFromUnlock(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test('a wrong master password is refused, and two-factor sign-in works', async ({ page }) => {
  test.setTimeout(150_000);
  const account = newAccount();
  await register(page, account);
  await signIn(page, account);

  await page.getByLabel('Master password', { exact: true }).fill(`${account.masterPassword}x`);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That master password is incorrect.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vault locked' })).toBeVisible();
  await unlock(page, account);

  // Turn it on from the Account page, as a person would.
  await page.getByRole('link', { name: 'Account' }).first().click();
  await page.getByRole('button', { name: /Turn on two-factor sign-in/ }).click();
  await page.getByLabel('Account password', { exact: true }).fill(account.accountPassword);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  const key = (await page.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).textContent()) ?? '';
  const totp = new TOTP({ secret: Secret.fromBase32(key.replace(/\s/g, '')) });
  const firstCode = totp.generate();
  await page.getByLabel('6-digit code').fill(firstCode);
  await page.getByRole('button', { name: 'Turn on' }).click();
  const codeItems = page
    .getByRole('listitem')
    .filter({ hasText: /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/ });
  // allTextContents does not wait, so wait for the codes to be shown first.
  await expect(codeItems).toHaveCount(10);
  const codes = await codeItems.allTextContents();
  await page.getByRole('button', { name: 'I have saved them' }).click();
  await expect(page.getByText(/10 recovery codes left/)).toBeVisible();

  // The secret is stored encrypted: neither its text nor its bytes appear in the database.
  const raw = Buffer.from(Secret.fromBase32(key.replace(/\s/g, '')).bytes).toString('hex');
  const dump = databaseDump();
  for (const value of [
    ...forms(key.replace(/\s/g, '')),
    raw,
    ...codes.map((c) => c.replace(/-/g, '')),
  ]) {
    expect(dump.includes(value), 'secret or recovery code in the database').toBe(false);
  }

  // Signing in now needs a second step. First with a recovery code.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await passwordStep(page, account);
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText(/That code is not valid/)).toBeVisible();
  await page.getByRole('button', { name: /Use a recovery code/ }).click();
  await page.getByLabel('Recovery code').fill(codes[0] ?? '');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Vault locked' })).toBeVisible();

  // Then with the app, after waiting for a code the server has not seen yet.
  await signOutFromUnlock(page);
  while (totp.generate() === firstCode) {
    await page.waitForTimeout(1000);
  }
  await passwordStep(page, account);
  await page.getByLabel('Verification code').fill(totp.generate());
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: 'Vault locked' })).toBeVisible();
  await unlock(page, account);
});
