import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Notice, Spinner } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { UnlockError } from '../../crypto/errors';
import { unlockVault } from '../../crypto/vault-keys';
import { account, vault as vaultApi } from '../../lib/api/endpoints';
import { useCurrentUser } from '../../lib/api/queries';
import { messageFor } from '../../lib/errors';
import { getArgon2, lock } from '../../vault-session/session';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t border-line pt-6 md:grid-cols-[14rem_1fr] md:gap-8">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current account password.').max(128),
    next: z.string().min(12, 'Use at least 12 characters.').max(128, 'Use at most 128 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    path: ['confirm'],
    message: 'The two entries do not match.',
  });
type PasswordValues = z.infer<typeof passwordSchema>;

/**
 * Before changing the account password, the client checks that the new one does not also open the
 * vault. If it did, the server would receive the master password at every sign-in.
 */
async function opensVault(candidate: string): Promise<boolean> {
  const info = await vaultApi.get();
  try {
    await unlockVault(candidate, info.material, getArgon2());
    return true;
  } catch (e) {
    if (e instanceof UnlockError) return false;
    throw e;
  }
}

function AccountPassword() {
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', next: '', confirm: '' },
  });
  const next = useWatch({ control: form.control, name: 'next' });
  const [error, setError] = useState<string | null>(null);

  async function submit(values: PasswordValues) {
    setError(null);
    try {
      if (await opensVault(values.next)) {
        form.setError('next', {
          message: 'This is your master password. Choose a different account password.',
        });
        return;
      }
      await account.changePassword(values.current, values.next);
      form.reset();
      toast('Account password changed. Other sessions were signed out.');
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="flex max-w-md flex-col gap-4">
      <PasswordField
        label="Current account password"
        autoComplete="current-password"
        error={form.formState.errors.current?.message}
        {...form.register('current')}
      />
      <PasswordField
        label="New account password"
        autoComplete="new-password"
        error={form.formState.errors.next?.message}
        {...form.register('next')}
      />
      <StrengthMeter password={next} />
      <PasswordField
        label="Confirm new account password"
        autoComplete="new-password"
        error={form.formState.errors.confirm?.message}
        {...form.register('confirm')}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" busy={form.formState.isSubmitting}>
          Change account password
        </Button>
      </div>
    </form>
  );
}

function Sessions() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: account.sessions });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] });

  if (sessions.isPending) return <Spinner label="Loading sessions" />;
  if (sessions.error) return <Notice tone="danger">{messageFor(sessions.error)}</Notice>;
  const others = sessions.data.sessions.filter((s) => !s.current);

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line border-y border-line">
        {sessions.data.sessions.map((s) => (
          <li
            key={s.handle}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <span>
              <span className="font-medium">{s.current ? 'This browser' : 'Another browser'}</span>
              <span className="block text-muted">
                Signed in {new Date(s.createdAt).toLocaleString()}, last active{' '}
                {new Date(s.lastAccessedAt).toLocaleString()}
              </span>
            </span>
            {!s.current ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  account.revokeSession(s.handle).then(refresh, (e: unknown) => {
                    setError(messageFor(e));
                  });
                }}
              >
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {others.length > 0 ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              account.revokeOtherSessions().then(refresh, (e: unknown) => {
                setError(messageFor(e));
              });
            }}
          >
            Sign out all other sessions
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const deleteSchema = z.object({
  confirmation: z.literal('DELETE MY ACCOUNT', { error: 'Type DELETE MY ACCOUNT exactly.' }),
  accountPassword: z.string().min(1, 'Enter your account password.').max(128),
});
type DeleteValues = z.input<typeof deleteSchema>;

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const form = useForm<DeleteValues>({
    resolver: zodResolver(deleteSchema),
    defaultValues: { confirmation: '' as 'DELETE MY ACCOUNT', accountPassword: '' },
  });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function submit(values: DeleteValues) {
    setError(null);
    try {
      await account.delete(values.accountPassword);
      lock();
      queryClient.clear();
      void navigate('/', { replace: true });
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        Delete account
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Delete your account?"
        description="Your account, your vault, and every saved item are deleted immediately. This cannot be undone."
      >
        <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
          <TextField
            label="Type DELETE MY ACCOUNT to confirm"
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
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" busy={form.formState.isSubmitting}>
              Delete account permanently
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AccountPage() {
  const me = useCurrentUser();
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        {me.data ? <p className="mt-1 break-all text-muted">{me.data.email}</p> : null}
      </div>
      <Section
        title="Account password"
        description="Signs you in. It can be reset by email; your master password cannot."
      >
        <AccountPassword />
      </Section>
      <Section title="Sessions" description="Browsers currently signed in to your account.">
        <Sessions />
      </Section>
      <Section
        title="Forgotten master password"
        description="The only way forward is a new, empty vault."
      >
        <Link to="/reset-vault" className="text-accent underline-offset-4 hover:underline">
          Reset vault
        </Link>
      </Section>
      <Section title="Delete account" description="Removes your account and vault from the server.">
        <DeleteAccount />
      </Section>
    </div>
  );
}
