import { useQueryClient } from '@tanstack/react-query';
import { LockKeyhole } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Wordmark } from '../../components/layout/Wordmark';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { auth } from '../../lib/api/endpoints';
import { useCurrentUser } from '../../lib/api/queries';
import { messageFor } from '../../lib/errors';
import { lock, unlock } from '../../vault-session/session';

export function UnlockPage() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      void navigate(from?.startsWith('/app') ? from : '/app', { replace: true });
    } catch (e) {
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
    <div className="flex min-h-dvh flex-col">
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
      <main id="main" className="flex flex-1 items-start justify-center px-4 pt-[12vh]">
        <form
          noValidate
          onSubmit={(e) => void submit(e)}
          className="flex w-full max-w-sm flex-col gap-5"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-accent">
              <LockKeyhole size={20} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Vault locked</h1>
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
    </div>
  );
}

export function UnlockFailureHint() {
  return (
    <Notice tone="neutral">
      Unlock again to continue. Locking happened in this tab or another one.
    </Notice>
  );
}
