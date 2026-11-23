import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '../../app/query-client';
import { ToastRegion } from '../../components/ui/Toast';
import { fake } from '../../test/fake-server';
import { renderApp, sentToServer, signedInUser } from '../../test/helpers';
import { TwoFactorSection } from './TwoFactorSection';

function renderSection() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TwoFactorSection />
      <ToastRegion />
    </QueryClientProvider>,
  );
}

describe('turning on two-factor sign-in', () => {
  it('needs the account password, a code from the app, and shows recovery codes once', async () => {
    const user = userEvent.setup();
    const account = await signedInUser();
    renderSection();

    await user.click(await screen.findByRole('button', { name: /Turn on two-factor/ }));
    await user.type(screen.getByLabelText('Account password'), 'not-the-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Your account password is incorrect.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Account password'));
    await user.type(screen.getByLabelText('Account password'), account.accountPassword);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // The QR code is drawn as SVG, and the key is shown for manual entry.
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByText(/JBSW Y3DP/)).toBeInTheDocument();

    const code = screen.getByLabelText('6-digit code');
    await user.type(code, '000000');
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText(/That code is not valid/)).toBeInTheDocument();

    await user.clear(code);
    await user.type(code, fake.mfaCode);
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'I have saved them' }));
    expect(await screen.findByText(/10 recovery codes left/)).toBeInTheDocument();
    expect(account.user.mfa?.enabled).toBe(true);
  });

  it('turns off with the password and a code', async () => {
    const user = userEvent.setup();
    const account = await signedInUser();
    account.user.mfa = { enabled: true, recovery: ['ABCD2222WXYZ'] };
    renderSection();

    await user.click(await screen.findByRole('button', { name: /Turn off/ }));
    await user.type(screen.getByLabelText('Account password'), account.accountPassword);
    await user.type(screen.getByLabelText(/Code from your app/), fake.mfaCode);
    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByRole('button', { name: /Turn on two-factor/ })).toBeInTheDocument();
    expect(account.user.mfa).toBeUndefined();
  });
});

describe('signing in with two-factor', () => {
  async function passwordStep() {
    const user = userEvent.setup();
    const account = await signedInUser();
    account.user.mfa = { enabled: true, recovery: ['ABCD2222WXYZ'] };
    fake.signedIn = null;
    renderApp('/login');
    await user.type(screen.getByLabelText('Email'), account.email);
    await user.type(screen.getByLabelText('Account password'), account.accountPassword);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Two-factor sign-in' });
    return { user, account };
  }

  it('asks for a code after the password and then continues to unlock', async () => {
    const { user, account } = await passwordStep();
    // The password step alone did not sign in.
    expect(fake.signedIn).toBeNull();

    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(/That code is not valid/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Verification code'), fake.mfaCode);
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('heading', { name: 'Vault locked' })).toBeInTheDocument();

    // The code request carried only the code.
    const codeRequest = fake.requests.find((r) => r.path === '/api/v1/auth/login/mfa');
    expect(codeRequest?.body).not.toContain(account.accountPassword);
  });

  it('accepts a recovery code typed loosely', async () => {
    const { user } = await passwordStep();
    await user.click(screen.getByRole('button', { name: /Use a recovery code/ }));
    await user.type(screen.getByLabelText('Recovery code'), 'abcd-2222-wxyz');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('heading', { name: 'Vault locked' })).toBeInTheDocument();
  });

  it('never sends the master password while doing so', async () => {
    const { account } = await passwordStep();
    expect(sentToServer(account.masterPassword)).toBe(false);
  });
});
