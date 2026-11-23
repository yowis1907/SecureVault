import { useQueryClient } from '@tanstack/react-query';
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { clsx } from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router';
import { AuthBackdrop } from '../../components/layout/AuthLayout';
import { Wordmark } from '../../components/layout/Wordmark';
import { setSceneMode } from '../../components/scene/signal';
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

  useEffect(
    () => () => {
      setSceneMode('idle');
    },
    [],
  );
  const from = (location.state as { from?: string } | null)?.from;

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    if (!password) {
      setError('Enter your master password.');
      return;
    }
    setBusy(true);
    setError(null);
    setSceneMode('deriving');
    try {
      await unlock(password);
      setPassword('');
      setOpened(true);
      setSceneMode('open');
      // A short beat so the vault visibly opens before the page changes.
      if (!reducedMotion) await new Promise((r) => setTimeout(r, 420));
      void navigate(from?.startsWith('/app') ? from : '/app', { replace: true });
    } catch (e) {
      setSceneMode('error');
      setShake((n) => n + 1);
      setError(messageFor(e));
      setSceneMode('idle');
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
    <AuthBackdrop>
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Wordmark />
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
        >
          Sign out
        </button>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-[10vh] pb-12">
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className={clsx(
            'glass rise flex w-full max-w-sm flex-col gap-5 p-6 sm:p-8',
            shake > 0 && (shake % 2 ? 'shake-a' : 'shake-b'),
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                'flex size-12 items-center justify-center rounded-full border text-accent transition-all duration-500',
                opened
                  ? 'scale-110 border-accent bg-accent-soft shadow-[0_0_30px_-4px_var(--sv-accent)]'
                  : busy
                    ? 'animate-pulse border-accent/60 bg-surface'
                    : 'border-line bg-surface',
              )}
            >
              {opened ? (
                <LockKeyholeOpen size={22} aria-hidden="true" />
              ) : (
                <LockKeyhole size={22} aria-hidden="true" />
              )}
            </span>
            <div>
              <h1 className="display text-2xl font-bold">
                {opened ? 'Vault open' : 'Vault locked'}
              </h1>
              {me.data ? <p className="text-sm break-all text-muted">{me.data.email}</p> : null}
            </div>
          </div>
          <PasswordField
            label="Master password"
            // Discourages the browser from offering to save the master password.
            autoComplete="off"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            hint="Your vault is decrypted on this device. The master password is never sent."
            error={error ?? undefined}
          />
          <Button type="submit" busy={busy}>
            {busy ? 'Unlocking' : 'Unlock'}
          </Button>
          {busy ? (
            <p role="status" className="text-sm text-muted">
              Deriving your key. This deliberately takes a moment.
            </p>
          ) : null}
          <Link
            to="/reset-vault"
            className="text-sm text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Forgot your master password?
          </Link>
        </form>
      </main>
    </AuthBackdrop>
  );
}
