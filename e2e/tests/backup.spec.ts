import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { newAccount, register, signIn, unlock } from './flows';
import { canary, recordTraffic } from './support';

/**
 * Backup in a real browser: the file is made and downloaded on the device under the production
 * CSP, contains no readable secrets, and restores into a different account.
 */
test('an encrypted backup downloads, contains no plaintext, and restores into another vault', async ({
  browser,
}) => {
  const passphrase = canary('backup');
  const entry = { title: canary('title'), password: canary('password') };

  // First account: add a login and download a backup.
  const first = await browser.newContext({ acceptDownloads: true });
  const page = await first.newPage();
  const a = newAccount();
  await register(page, a);
  await signIn(page, a);
  await unlock(page, a);
  await page.getByRole('link', { name: 'Add your first login' }).click();
  await page.getByLabel('Name', { exact: true }).fill(entry.title);
  await page.getByLabel('Password', { exact: true }).fill(entry.password);
  await page.getByRole('button', { name: 'Add login' }).click();
  await expect(page.getByRole('heading', { level: 2, name: entry.title })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main' })
    .first()
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByLabel('Backup passphrase', { exact: true }).fill(passphrase);
  await page.getByLabel('Confirm backup passphrase', { exact: true }).fill(passphrase);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted backup' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^securevault-backup-\d{4}-\d{2}-\d{2}\.json$/);
  // Saved outside the browser context, which deletes its downloads when it closes.
  const filePath = test.info().outputPath('backup.json');
  await download.saveAs(filePath);
  const fileText = readFileSync(filePath, 'utf8');
  for (const secret of [entry.title, entry.password, passphrase, a.masterPassword]) {
    expect(fileText.includes(secret), 'backup file contains a secret').toBe(false);
  }
  expect(JSON.parse(fileText)).toMatchObject({
    header: { format: 'securevault-backup', version: 1 },
  });
  await first.close();

  // Second account: import the file.
  const second = await browser.newContext();
  const traffic = recordTraffic(second);
  const other = await second.newPage();
  const b = newAccount();
  await register(other, b);
  await signIn(other, b);
  await unlock(other, b);
  await other
    .getByRole('navigation', { name: 'Main' })
    .first()
    .getByRole('link', { name: 'Settings' })
    .click();

  await other.getByLabel('Backup file', { exact: true }).setInputFiles(filePath);
  await other.getByLabel('Passphrase for this backup', { exact: true }).fill('wrong passphrase');
  await other.getByRole('button', { name: 'Import backup' }).click();
  await expect(
    other.getByText('The backup passphrase is incorrect, or the file is damaged.'),
  ).toBeVisible();

  await other.getByLabel('Passphrase for this backup', { exact: true }).fill(passphrase);
  await other.getByRole('button', { name: 'Import backup' }).click();
  await expect(other.getByText('Imported 1 login and 0 new categories.')).toBeVisible();

  await other
    .getByRole('navigation', { name: 'Main' })
    .first()
    .getByRole('link', { name: 'Vault' })
    .click();
  await other.getByRole('link', { name: new RegExp(entry.title) }).click();
  await other.getByRole('button', { name: 'Show password' }).click();
  await expect(other.getByText(entry.password)).toBeVisible();

  // The import uploaded ciphertext only.
  const exchanged = await traffic.all();
  for (const secret of [entry.title, entry.password, passphrase]) {
    expect(
      exchanged.filter((e) => e.requestBody.includes(secret)).map((e) => e.url),
      'secret sent during import',
    ).toEqual([]);
  }
  await second.close();
});
