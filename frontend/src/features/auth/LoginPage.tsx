import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { AuthLayout, TextLink } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { ApiError } from '../../lib/api/client';
import { auth } from '../../lib/api/endpoints';
import { messageFor } from '../../lib/errors';

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  accountPassword: z.string().min(1, 'Enter your account password.').max(128),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', accountPassword: '' },
  });
  const [error, setError] = useState<{ text: string; unverified: boolean } | null>(null);
  const [resent, setResent] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const from = (location.state as { from?: string } | null)?.from;

  async function submit(values: Values) {
    setError(null);
    try {
      const user = await auth.login(values.email, values.accountPassword);
      queryClient.setQueryData(['me'], user);
      void navigate('/unlock', { replace: true, state: from ? { from } : undefined });
    } catch (e) {
      setError({
        text: messageFor(e),
        unverified: e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED',
      });
    }
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
