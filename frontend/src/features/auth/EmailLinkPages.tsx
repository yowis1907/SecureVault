import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout, TextLink } from '../../components/layout/AuthLayout';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Notice, Spinner } from '../../components/ui/Notice';
import { auth } from '../../lib/api/endpoints';
import { messageFor } from '../../lib/errors';
import { clearFragment, readTokenFromFragment } from './tokenFromFragment';

const INCOMPLETE = 'This link is incomplete. Open the newest link from the email.';

export function VerifyEmailPage() {
  const [token] = useState(readTokenFromFragment);
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  const [error, setError] = useState(token ? '' : INCOMPLETE);
  const started = useRef(false);

  useEffect(() => {
    clearFragment();
    // Strict Mode runs effects twice in development; the token works only once.
    if (!token || started.current) return;
    started.current = true;
    auth.verifyEmail(token).then(
      () => {
        setState('done');
      },
      (e: unknown) => {
        setError(messageFor(e));
        setState('failed');
      },
    );
  }, [token]);

  return (
    <AuthLayout title="Confirm your email">
      {state === 'working' ? <Spinner label="Confirming" /> : null}
      {state === 'done' ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success" title="Email confirmed">
            Your vault is ready.
          </Notice>
          <TextLink to="/login">Sign in</TextLink>
        </div>
      ) : null}
      {state === 'failed' ? (
        <div className="flex flex-col gap-4">
          <Notice tone="danger">{error}</Notice>
          <TextLink to="/login">Go to sign in, where you can ask for a new link</TextLink>
        </div>
      ) : null}
    </AuthLayout>
  );
}

const emailSchema = z.object({ email: z.email('Enter a valid email address.') });

export function ForgotPasswordPage() {
  const form = useForm<{ email: string }>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthLayout
      title="Reset your account password"
      intro="This resets the password you sign in with. It cannot reset your master password, and your vault stays as it is."
      footer={<TextLink to="/login">Back to sign in</TextLink>}
    >
      {sent ? (
        <Notice tone="success" title="Check your email">
          If an account uses that address, a reset link is on its way. It expires in 30 minutes.
        </Notice>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit(async ({ email }) => {
            setError(null);
            try {
              await auth.forgotPassword(email);
              setSent(true);
            } catch (e) {
              setError(messageFor(e));
            }
          })}
        >
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" busy={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

const resetSchema = z
  .object({
    password: z
      .string()
      .min(12, 'Use at least 12 characters.')
      .max(128, 'Use at most 128 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The two entries do not match.',
  });

export function ResetPasswordPage() {
  const [token] = useState(readTokenFromFragment);
  const form = useForm<{ password: string; confirm: string }>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const password = useWatch({ control: form.control, name: 'password' });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearFragment();
  }, []);

  return (
    <AuthLayout
      title="Choose a new account password"
      footer={<TextLink to="/login">Back to sign in</TextLink>}
    >
      {!token ? (
        <Notice tone="danger">{INCOMPLETE}</Notice>
      ) : done ? (
        <div className="flex flex-col gap-4">
          <Notice tone="success" title="Account password changed">
            Every signed-in session has ended. Sign in with the new password.
          </Notice>
          <TextLink to="/login">Sign in</TextLink>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit(async (values) => {
            setError(null);
            try {
              await auth.resetPassword(token, values.password);
              setDone(true);
            } catch (e) {
              setError(messageFor(e));
            }
          })}
        >
          <Notice tone="warn">
            Do not use your master password here. The server sees this password whenever you sign
            in, so the two must be different.
          </Notice>
          <PasswordField
            label="New account password"
            autoComplete="new-password"
            error={form.formState.errors.password?.message}
            {...form.register('password')}
          />
          <StrengthMeter password={password} />
          <PasswordField
            label="Confirm new account password"
            autoComplete="new-password"
            error={form.formState.errors.confirm?.message}
            {...form.register('confirm')}
          />
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" busy={form.formState.isSubmitting}>
            Change account password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
