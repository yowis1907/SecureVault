import { zodResolver } from '@hookform/resolvers/zod';
import { clsx } from 'clsx';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { AuthLayout, TextLink } from '../../components/layout/AuthLayout';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { createVaultKeys } from '../../crypto/vault-keys';
import { auth } from '../../lib/api/endpoints';
import { messageFor } from '../../lib/errors';
import { estimateStrength } from '../../lib/strength';
import { getArgon2 } from '../../vault-session/session';

const accountSchema = z
  .object({
    email: z.email('Enter a valid email address.').max(254),
    accountPassword: z
      .string()
      .min(12, 'Use at least 12 characters.')
      .max(128, 'Use at most 128 characters.'),
  })
  .strict();

const masterSchema = z
  .object({
    masterPassword: z.string().min(12, 'Use at least 12 characters.').max(1024),
    confirm: z.string(),
    understood: z.literal(true, { error: 'Confirm that you understand this.' }),
  })
  .refine((v) => v.masterPassword === v.confirm, {
    path: ['confirm'],
    message: 'The two entries do not match.',
  });

type AccountValues = z.infer<typeof accountSchema>;
type MasterValues = z.input<typeof masterSchema>;

const STEPS = ['Account', 'Master password', 'Confirm email'] as const;

function Steps({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex gap-2 text-sm" aria-label="Sign-up progress">
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? 'step' : undefined}
          className={clsx(
            'flex flex-1 flex-col gap-1.5 border-t-2 pt-2',
            i <= current ? 'border-accent text-text' : 'border-line text-muted',
          )}
        >
          <span className="font-mono text-xs">{String(i + 1)}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function RegisterPage() {
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<AccountValues | null>(null);

  if (step === 2 && account) {
    return <CheckEmail email={account.email} />;
  }

  return (
    <AuthLayout
      title="Create your vault"
      intro="Two passwords protect SecureVault, and each has its own job."
      footer={
        <>
          Already have an account? <TextLink to="/login">Sign in</TextLink>
        </>
      }
    >
      <Steps current={step} />
      {step === 0 ? (
        <AccountStep
          initial={account}
          onDone={(values) => {
            setAccount(values);
            setStep(1);
          }}
        />
      ) : account ? (
        <MasterStep
          account={account}
          onBack={() => {
            setStep(0);
          }}
          onDone={() => {
            setStep(2);
          }}
        />
      ) : null}
    </AuthLayout>
  );
}

function AccountStep({
  initial,
  onDone,
}: {
  initial: AccountValues | null;
  onDone: (values: AccountValues) => void;
}) {
  const form = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: initial ?? { email: '', accountPassword: '' },
  });
  const password = useWatch({ control: form.control, name: 'accountPassword' });
  const email = useWatch({ control: form.control, name: 'email' });

  return (
    <form noValidate onSubmit={form.handleSubmit(onDone)} className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Your <strong className="text-text">account password</strong> signs you in. The server checks
        it, and you can reset it by email if you forget it.
      </p>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email?.message}
        {...form.register('email')}
      />
      <PasswordField
        label="Account password"
        autoComplete="new-password"
        error={form.formState.errors.accountPassword?.message}
        {...form.register('accountPassword')}
      />
      <StrengthMeter password={password} userInputs={[email]} />
      <Button type="submit">Continue</Button>
    </form>
  );
}

function MasterStep({
  account,
  onBack,
  onDone,
}: {
  account: AccountValues;
  onBack: () => void;
  onDone: () => void;
}) {
  const form = useForm<MasterValues>({
    resolver: zodResolver(masterSchema),
    defaultValues: { masterPassword: '', confirm: '', understood: false as unknown as true },
  });
  const master = useWatch({ control: form.control, name: 'masterPassword' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(values: MasterValues) {
    setError(null);
    // Compared here, while both are in memory. If they matched, the server would receive the
    // master password at every sign-in (ARCHITECTURE section 5.7).
    if (values.masterPassword === account.accountPassword) {
      form.setError('masterPassword', {
        message: 'Use a different password from your account password.',
      });
      return;
    }
    const strength = await estimateStrength(values.masterPassword, [account.email]);
    if (strength.score < 3) {
      form.setError('masterPassword', {
        message: 'Choose a stronger master password. It is the only thing protecting your vault.',
      });
      return;
    }
    setBusy(true);
    try {
      // The keys are made here. Only the wrapped key and its parameters go to the server.
      const { material } = await createVaultKeys(
        values.masterPassword,
        crypto.randomUUID(),
        getArgon2(),
      );
      await auth.register(account.email, account.accountPassword, material);
      onDone();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
      <Notice tone="warn" title="Your master password cannot be reset">
        It encrypts your vault on this device, and the server never sees it. If you forget it,
        nobody can recover your vault, including us. Write it down somewhere safe.
      </Notice>
      <PasswordField
        label="Master password"
        autoComplete="off"
        hint="A long phrase of unrelated words is strong and easy to remember."
        error={form.formState.errors.masterPassword?.message}
        {...form.register('masterPassword')}
      />
      <StrengthMeter password={master} userInputs={[account.email]} />
      <PasswordField
        label="Confirm master password"
        autoComplete="off"
        error={form.formState.errors.confirm?.message}
        {...form.register('confirm')}
      />
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--sv-accent)]"
          aria-describedby="understood-error"
          {...form.register('understood')}
        />
        <span>I understand that a forgotten master password means a lost vault.</span>
      </label>
      {form.formState.errors.understood ? (
        <p id="understood-error" role="alert" className="-mt-3 text-sm text-danger">
          {form.formState.errors.understood.message}
        </p>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" busy={busy} className="flex-1">
          {busy ? 'Creating your vault' : 'Create vault'}
        </Button>
      </div>
      {busy ? (
        <p className="text-sm text-muted" role="status">
          Deriving your key. This deliberately takes a moment, which makes guessing slow too.
        </p>
      ) : null}
    </form>
  );
}

function CheckEmail({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthLayout title="Check your email">
      <Steps current={2} />
      <p>
        We sent a confirmation link to <strong className="break-all">{email}</strong>. Open it to
        finish, then sign in. The link expires in 24 hours.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {sent ? (
          <Notice tone="success">If the address needs confirming, a new link is on its way.</Notice>
        ) : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            auth.resendVerification(email).then(
              () => {
                setSent(true);
              },
              (e: unknown) => {
                setError(messageFor(e));
              },
            );
          }}
        >
          Send the link again
        </Button>
        <TextLink to="/login">Go to sign in</TextLink>
      </div>
    </AuthLayout>
  );
}
