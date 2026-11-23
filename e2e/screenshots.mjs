// Captures the README screenshots from the running Docker stack, so they always show the real
// app. Every account and entry here is made-up sample data.
//
//   PW_CHANNEL=msedge node screenshots.mjs
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const account = {
  email: `sample-${randomUUID().slice(0, 8)}@example.test`,
  accountPassword: `sample-account-${randomUUID()}`,
  masterPassword: `sample master phrase ${randomUUID()}`,
};

const entries = [
  {
    name: 'Example Bank',
    username: 'sample.user',
    password: 'summer2024',
    url: 'https://bank.example',
    favorite: true,
  },
  {
    name: 'Example Mail',
    username: 'sample.user@example.test',
    password: 'summer2024',
    url: 'https://mail.example',
  },
  {
    name: 'Code Hosting',
    username: 'sample-dev',
    generate: true,
    url: 'https://code.example',
    tags: 'work, code',
    favorite: true,
  },
  { name: 'Streaming', username: 'sample.user', generate: true, url: 'https://video.example' },
  {
    name: 'Travel Booking',
    username: 'sample.user',
    generate: true,
    url: 'https://travel.example',
    notes: 'Loyalty number is on the card.',
  },
];

async function emailLink(address) {
  for (let i = 0; i < 40; i++) {
    const search = await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
    ).json();
    const id = search.messages?.[0]?.ID;
    if (id) {
      const text = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).Text;
      const link = /https?:\/\/\S+#token=[A-Za-z0-9_-]+/.exec(text)?.[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('No verification email arrived');
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light',
});
const page = await context.newPage();
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  console.log(`saved ${name}.png`);
};
const exact = { exact: true };

// The wait lets the entrance animations settle.
await page.goto(BASE);
await page.waitForTimeout(1200);
await shot('landing');

await page.goto(`${BASE}/register`);
await page.getByLabel('Email', exact).fill(account.email);
await page.getByLabel('Account password', exact).fill(account.accountPassword);
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByLabel('Master password', exact).fill(account.masterPassword);
await page.getByLabel('Confirm master password', exact).fill(account.masterPassword);
await page.getByRole('checkbox').check();
await page.getByText('Very strong').waitFor();
await shot('register-master-password');
await page.getByRole('button', { name: 'Create vault' }).click();
await page.getByRole('heading', { name: 'Check your email' }).waitFor();
await page.goto(await emailLink(account.email));
await page.getByText('Email confirmed').waitFor();

await page.goto(`${BASE}/login`);
await page.getByLabel('Email', exact).fill(account.email);
await page.getByLabel('Account password', exact).fill(account.accountPassword);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'Vault locked' }).waitFor();
await shot('unlock');
await page.getByLabel('Master password', exact).fill(account.masterPassword);
await page.getByRole('button', { name: 'Unlock' }).click();
await page.getByRole('button', { name: /Vault unlocked/ }).waitFor();

// In-app navigation only: a full page load would lock the vault, by design.
const nav = (name) =>
  page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name }).click();

for (const entry of entries) {
  await nav('Vault');
  await page.getByRole('link', { name: 'Add login' }).click();
  await page.getByLabel('Name', exact).fill(entry.name);
  await page.getByLabel('Username', exact).fill(entry.username);
  if (entry.generate) await page.getByRole('button', { name: 'Generate' }).click();
  else await page.getByLabel('Password', exact).fill(entry.password);
  await page.getByLabel('Websites', exact).fill(entry.url);
  if (entry.tags) await page.getByLabel('Tags', exact).fill(entry.tags);
  if (entry.notes) await page.getByLabel('Notes', exact).fill(entry.notes);
  if (entry.favorite) await page.getByLabel('Favorite', exact).check();
  await page.getByRole('button', { name: 'Add login' }).click();
  await page.getByRole('heading', { level: 2, name: entry.name }).waitFor();
}

// Let the 'Login added' confirmations clear so they are not in the pictures.
await page.getByText('Login added').first().waitFor({ state: 'detached', timeout: 10_000 });

await nav('Vault');
await page.getByRole('link', { name: /Code Hosting/ }).click();
await page.getByRole('heading', { level: 2, name: 'Code Hosting' }).waitFor();
await shot('vault');

await nav('Overview');
await page.getByRole('heading', { name: 'Overview' }).waitFor();
await shot('overview');

await nav('Security');
await page.getByText('of passwords are strong').waitFor();
await shot('security');

await page.emulateMedia({ colorScheme: 'dark' });
await nav('Generator');
await page.getByRole('heading', { name: 'Password generator' }).waitFor();
await page
  .getByText(/Very strong|Strong/)
  .first()
  .waitFor();
await shot('generator-dark');

await nav('Vault');
await page.getByRole('link', { name: /Example Bank/ }).click();
await shot('vault-dark');

await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('link', { name: 'All logins' }).click();
await shot('vault-phone-dark');

await browser.close();
