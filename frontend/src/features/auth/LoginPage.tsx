import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { AuthLayout, TextLink } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { ApiError } from '../../lib/api/client';
import { auth, type User } from '../../lib/api/endpoints';
import { messageFor } from '../../lib/errors';

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  accountPassword: z.string().min(1, 'Enter your account password.').max(128),
});
type Values = z.infer<typeof schema>;

/**
 * The second step when two-factor sign-in is on: a code from the authenticator app, or one of the
 * recovery codes. The half-finished sign-in is held by the server, not here.
 */
function CodeStep({
  onSignedIn,
  onRestart,
}: {
  onSignedIn: (user: User) => void;
  onRestart: () => void;
}) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!value) {
      setError({
        text: recovery ? 'Enter a recovery code.' : 'Enter the 6-digit code.',
        expired: false,
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await auth.loginMfa(value));
    } catch (e) {
      setError({
        text: messageFor(e),
        expired: e instanceof ApiError && e.code === 'MFA_CHALLENGE_EXPIRED',
      });
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm">
        <ShieldCheck size={20} className="flex-none text-accent" aria-hidden="true" />
        {recovery
          ? 'Enter one of the recovery codes you saved when you turned on two-factor sign-in. Each works once.'
          : 'Open your authenticator app and enter the 6-digit code for SecureVault.'}
      </div>
      <TextField
        label={recovery ? 'Recovery code' : 'Verification code'}
        autoFocus
        autoComplete="one-time-code"
        inputMode={recovery ? 'text' : 'numeric'}
        maxLength={recovery ? 20 : 6}
        spellCheck={false}
        value={code}
        onChange={(e) => {
          setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, ''));
        }}
        className={
          recovery ? 'secret tracking-wider' : 'secret text-center text-xl tracking-[0.4em]'
        }
      />
      {error ? (
        <Notice tone="danger">
          {error.text}
          {error.expired ? (
            <button
              type="button"
              className="mt-2 block font-medium text-accent underline-offset-4 hover:underline"
              onClick={onRestart}
            >
              Start again
            </button>
          ) : null}
        </Notice>
      ) : null}
      <Button type="submit" busy={busy}>
        Verify
      </Button>
      <button
        type="button"
        className="text-[0.9375rem] font-medium text-accent underline-offset-4 hover:underline"
        onClick={() => {
          setRecovery((r) => !r);
          setCode('');
          setError(null);
        }}
      >
        {recovery ? 'Use the authenticator app instead' : 'Lost your phone? Use a recovery code'}
      </button>
    </form>
  );
}

export function LoginPage() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', accountPassword: '' },
  });
  const [error, setError] = useState<{ text: string; unverified: boolean } | null>(null);
  const [resent, setResent] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const from = (location.state as { from?: string } | null)?.from;

  function signedIn(user: User) {
    queryClient.setQueryData(['me'], user);
    void navigate('/unlock', { replace: true, state: from ? { from } : undefined });
  }

  async function submit(values: Values) {
    setError(null);
    try {
      const result = await auth.login(values.email, values.accountPassword);
      if ('mfaRequired' in result) {
        // The password is no longer needed here; clear it from the form.
        form.setValue('accountPassword', '');
        setNeedsCode(true);
        return;
      }
      signedIn(result);
    } catch (e) {
      setError({
        text: messageFor(e),
        unverified: e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED',
      });
    }
  }

  if (needsCode) {
    return (
      <AuthLayout
        title="Two-factor sign-in"
        intro="Your password was correct. One more step to confirm it is you."
      >
        <CodeStep
          onSignedIn={signedIn}
          onRestart={() => {
            setNeedsCode(false);
          }}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      intro="Use your account password. You will unlock your vault with your master password next."
      footer={
        <>
          New to SecureVault? <TextLink to="/register">Create a vault</TextLink>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <PasswordField
          label="Account password"
          autoComplete="current-password"
          error={form.formState.errors.accountPassword?.message}
          {...form.register('accountPassword')}
        />
        {error ? (
          <Notice tone="danger">
            {error.text}
            {error.unverified ? (
              <button
                type="button"
                className="mt-2 block font-medium text-accent underline-offset-4 hover:underline"
                onClick={() => {
                  void auth.resendVerification(form.getValues('email')).then(() => {
                    setResent(true);
                  });
                }}
              >
                {resent ? 'A new link is on its way' : 'Send the confirmation link again'}
              </button>
            ) : null}
          </Notice>
        ) : null}
        <Button type="submit" busy={form.formState.isSubmitting}>
          Sign in
        </Button>
        <TextLink to="/forgot-password">Forgot your account password?</TextLink>
      </form>
    </AuthLayout>
  );
}
