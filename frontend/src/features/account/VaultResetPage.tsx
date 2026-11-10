import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { AuthLayout, TextLink } from '../../components/layout/AuthLayout';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { createVaultKeys } from '../../crypto/vault-keys';
import { vault } from '../../lib/api/endpoints';
import { messageFor } from '../../lib/errors';
import { estimateStrength } from '../../lib/strength';
import { getArgon2, lock } from '../../vault-session/session';

const schema = z
  .object({
    confirmation: z.literal('DELETE MY VAULT', { error: 'Type DELETE MY VAULT exactly.' }),
    accountPassword: z.string().min(1, 'Enter your account password.').max(128),
    masterPassword: z.string().min(12, 'Use at least 12 characters.').max(1024),
    confirm: z.string(),
  })
  .refine((v) => v.masterPassword === v.confirm, {
    path: ['confirm'],
    message: 'The two entries do not match.',
  });
type Values = z.input<typeof schema>;

/**
 * The only path after a forgotten master password. Nothing can decrypt the old vault, so it is
 * deleted and an empty one is created. Requires the account password and a typed confirmation.
 */
export function VaultResetPage() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      confirmation: '' as 'DELETE MY VAULT',
      accountPassword: '',
      masterPassword: '',
      confirm: '',
    },
  });
  const master = useWatch({ control: form.control, name: 'masterPassword' });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function submit(values: Values) {
    setError(null);
    if (values.masterPassword === values.accountPassword) {
      form.setError('masterPassword', {
        message: 'Use a different password from your account password.',
      });
      return;
    }
    if ((await estimateStrength(values.masterPassword)).score < 3) {
      form.setError('masterPassword', { message: 'Choose a stronger master password.' });
      return;
    }
    try {
      const { material } = await createVaultKeys(
        values.masterPassword,
        crypto.randomUUID(),
        getArgon2(),
      );
      await vault.reset(values.accountPassword, material);
      lock();
      queryClient.removeQueries({ queryKey: ['vault'] });
      void navigate('/unlock', { replace: true });
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <AuthLayout
      title="Start over with an empty vault"
      footer={<TextLink to="/unlock">Back to unlock</TextLink>}
    >
      <Notice tone="danger" title="Everything in your vault will be deleted">
        Your master password cannot be recovered, by anyone. Resetting permanently deletes every
        saved item and creates a new, empty vault with a new master password. Your account and
        sign-in stay the same.
      </Notice>
      <form noValidate onSubmit={form.handleSubmit(submit)} className="mt-6 flex flex-col gap-5">
        <TextField
          label="Type DELETE MY VAULT to confirm"
          autoComplete="off"
          error={form.formState.errors.confirmation?.message}
          {...form.register('confirmation')}
        />
        <PasswordField
          label="Account password"
          autoComplete="current-password"
          error={form.formState.errors.accountPassword?.message}
          {...form.register('accountPassword')}
        />
        <PasswordField
          label="New master password"
          autoComplete="off"
          error={form.formState.errors.masterPassword?.message}
          {...form.register('masterPassword')}
        />
        <StrengthMeter password={master} />
        <PasswordField
          label="Confirm new master password"
          autoComplete="off"
          error={form.formState.errors.confirm?.message}
          {...form.register('confirm')}
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button type="submit" variant="danger" busy={form.formState.isSubmitting}>
          Delete everything and create a new vault
        </Button>
      </form>
    </AuthLayout>
  );
}
