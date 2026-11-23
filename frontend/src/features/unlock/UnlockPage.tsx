import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AuthBackdrop } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/Field';
import { auth } from '../../lib/api/endpoints';
import { useCurrentUser } from '../../lib/api/queries';
import { messageFor } from '../../lib/errors';
import { useReducedMotion } from '../../lib/motion';
import { lock, unlock } from '../../vault-session/session';

export function UnlockPage() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [shake, setShake] = useState(0);
  const reducedMotion = useReducedMotion();
  const from = (location.state as { from?: string } | null)?.from;

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (!password) {
      setError('Enter your master password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      setPassword('');
      setOpened(true);
      // A short beat so the lock visibly opens before the page changes.
      if (!reducedMotion) await new Promise((r) => setTimeout(r, 350));
      void navigate(from?.startsWith('/app') ? from : '/app', { replace: true });
    } catch (e) {
      setShake((n) => n + 1);
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    lock();
    try {
      await auth.logout();
    } finally {
      queryClient.clear();
      void navigate('/login', { replace: true });
    }
  }

  return (
    <AuthBackdrop
      header={
        <button
          type="button"
          onClick={() => void signOut()}
          className="glass-clear rounded-full px-5 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--sv-glass-strong)]"
        >
          Sign out
        </button>
      }
    >
      <main id="main" className="w-full max-w-[420px]">
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className={clsx(
            'glass rise flex w-full flex-col items-center gap-5 px-8 pt-12 pb-9 sm:px-10',
            shake > 0 && (shake % 2 ? 'shake-a' : 'shake-b'),
          )}
        >
          {/* A glass disc over a soft accent halo; it breathes while the key is derived. */}
          <div className="relative mb-1 size-24" aria-hidden="true">
            <span
              className={clsx(
                'absolute inset-2 rounded-full bg-accent/40 blur-xl transition-opacity duration-500',
                opened ? 'opacity-100' : 'opacity-70',
              )}
            />
            <span
              className={clsx(
                'glass-clear absolute inset-0 flex items-center justify-center rounded-full transition-colors duration-500',
                busy && 'breathe',
                opened ? 'text-accent' : 'text-text',
              )}
            >
              {opened ? (
                <LockKeyholeOpen size={36} strokeWidth={1.75} />
              ) : (
                <LockKeyhole size={36} strokeWidth={1.75} />
              )}
            </span>
          </div>
          <div className="text-center">
            <h1 className="text-[2.5rem] leading-[1.1] font-semibold">
              {opened ? 'Vault open' : 'Vault locked'}
            </h1>
            {me.data ? (
              <p className="mt-1 text-[0.9375rem] break-all text-muted">{me.data.email}</p>
            ) : null}
          </div>
          <div className="w-full">
            <PasswordField
              label="Master password"
              // Discourages the browser from offering to save the master password.
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              error={error ?? undefined}
            />
          </div>
          <Button type="submit" busy={busy} className="w-full">
            {busy ? 'Unlocking' : 'Unlock'}
          </Button>
          <p role="status" className="max-w-[18rem] text-center text-[0.8125rem] text-muted">
            {busy
              ? 'Deriving your key. This deliberately takes a moment.'
              : 'Your vault is decrypted on this device. The master password is never sent.'}
          </p>
          <Link
            to="/reset-vault"
            className="text-[0.9375rem] font-medium text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Forgot your master password?
          </Link>
        </form>
      </main>
    </AuthBackdrop>
  );
}
