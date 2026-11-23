import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fake } from '../test/fake-server';
import { credentials, renderApp, sentToServer, signedInUser } from '../test/helpers';

describe('public pages', () => {
  it('shows the landing page with a live encryption demo', () => {
    renderApp('/');
    expect(
      screen.getByRole('heading', { level: 1, name: /sealed before they leave/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('On your device')).toBeInTheDocument();
  });

  it('sends visitors without a session to sign in', async () => {
    renderApp('/app/vault');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('registration', () => {
  it('rejects a master password equal to the account password', async () => {
    const user = userEvent.setup();
    const c = credentials();
    renderApp('/register');
    await user.type(screen.getByLabelText('Email'), c.email);
    await user.type(screen.getByLabelText('Account password'), c.accountPassword);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.type(await screen.findByLabelText('Master password'), c.accountPassword);
    await user.type(screen.getByLabelText('Confirm master password'), c.accountPassword);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create vault' }));

    expect(
      await screen.findByText('Use a different password from your account password.'),
    ).toBeInTheDocument();
    expect(fake.users.size).toBe(0);
    // The browser's own password manager must not be invited to save the master password.
    expect(screen.getByLabelText('Master password')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Confirm master password')).toHaveAttribute('autocomplete', 'off');
  });

  it('creates the vault on this device and never sends the master password', async () => {
    const user = userEvent.setup();
    const c = credentials();
    renderApp('/register');
    await user.type(screen.getByLabelText('Email'), c.email);
    await user.type(screen.getByLabelText('Account password'), c.accountPassword);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Master password'), c.masterPassword);
    await user.type(screen.getByLabelText('Confirm master password'), c.masterPassword);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create vault' }));

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }, { timeout: 15_000 }),
    ).toBeInTheDocument();
    const stored = fake.users.get(c.email);
    expect(stored?.vault.wrappedDek).toMatch(/^[A-Za-z0-9+/]{64}$/);
    expect(sentToServer(c.masterPassword)).toBe(false);
  }, 20_000);
});

describe('sign-in and unlock', () => {
  it('explains a wrong account password', async () => {
    const user = userEvent.setup();
    const account = await signedInUser();
    fake.signedIn = null;
    renderApp('/login');
    await user.type(screen.getByLabelText('Email'), account.email);
    await user.type(screen.getByLabelText('Account password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByText('The email or account password is incorrect.'),
    ).toBeInTheDocument();
  });

  it('signs in, unlocks with the master password, and shows the vault', async () => {
    const user = userEvent.setup();
    const account = await signedInUser();
    fake.signedIn = null;
    renderApp('/login');
    await user.type(screen.getByLabelText('Email'), account.email);
    await user.type(screen.getByLabelText('Account password'), account.accountPassword);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const master = await screen.findByLabelText('Master password');
    await user.type(master, 'wrong master password');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(
      await screen.findByText('That master password is incorrect.', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();

    await user.clear(master);
    await user.type(master, account.masterPassword);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(
      await screen.findByRole('heading', { name: 'Your vault is empty' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Vault unlocked\. Locks automatically/ }),
    ).toBeInTheDocument();
  }, 20_000);
});

describe('vault', () => {
  it('adds a login that is stored only as ciphertext', async () => {
    const user = userEvent.setup();
    const account = await signedInUser();
    const { router } = renderApp('/unlock');
    await user.type(await screen.findByLabelText('Master password'), account.masterPassword);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByRole('heading', { name: 'Your vault is empty' }, { timeout: 10_000 });

    await user.click(screen.getByRole('link', { name: /Add your first login/ }));
    const title = `Bank ${crypto.randomUUID()}`;
    await user.type(await screen.findByLabelText('Name'), title);
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'pw-secret-value-123');
    await user.click(screen.getByRole('button', { name: 'Add login' }));

    expect(await screen.findByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/app\/vault\/[0-9a-f-]{36}$/);
    });
    expect(sentToServer(title)).toBe(false);
    expect(sentToServer('pw-secret-value-123')).toBe(false);
    expect(account.user.records.size).toBe(1);
  }, 20_000);

  it('locks from the header and returns to the unlock screen', async () => {
    const user = userEvent.setup();
    const account = await signedInUser();
    renderApp('/unlock');
    await user.type(await screen.findByLabelText('Master password'), account.masterPassword);
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    const fuse = await screen.findByRole('button', { name: /Vault unlocked/ }, { timeout: 10_000 });

    await user.click(fuse);

    expect(await screen.findByRole('heading', { name: 'Vault locked' })).toBeInTheDocument();
  }, 20_000);
});
