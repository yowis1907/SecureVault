import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { changeMasterPassword } from '../../crypto/vault-keys';
import { vault as vaultApi } from '../../lib/api/endpoints';
import { messageFor } from '../../lib/errors';
import { estimateStrength } from '../../lib/strength';
import { getThemePreference, setThemePreference, type ThemePreference } from '../../lib/theme';
import { useUnlockedVault } from '../../vault-session/hooks';
import { getArgon2, saveSettings, setKeyVersion } from '../../vault-session/session';

const AUTO_LOCK = [1, 2, 5, 10, 15, 30, 60];
const CLIPBOARD = [10, 20, 30, 60, 120];

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

function Appearance() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">Theme</legend>
      {(['system', 'light', 'dark'] as const).map((value) => (
        <label
          key={value}
          className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={theme === value}
            onChange={() => {
              setTheme(value);
              setThemePreference(value);
            }}
            className="accent-[var(--sv-accent)]"
          />
          {value === 'system' ? 'Match device' : value === 'light' ? 'Light' : 'Dark'}
        </label>
      ))}
    </fieldset>
  );
}

function LockAndClipboard() {
  const vault = useUnlockedVault();
  const [autoLock, setAutoLock] = useState(vault.settings.autoLockMinutes);
  const [clipboard, setClipboard] = useState(vault.settings.clipboardClearSeconds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed =
    autoLock !== vault.settings.autoLockMinutes ||
    clipboard !== vault.settings.clipboardClearSeconds;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        saveSettings({ schema: 1, autoLockMinutes: autoLock, clipboardClearSeconds: clipboard })
          .then(() => {
            toast('Settings saved');
          })
          .catch((err: unknown) => {
            setError(messageFor(err));
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Lock after inactivity
          <select
            value={autoLock}
            onChange={(e) => {
              setAutoLock(Number(e.target.value));
            }}
            className="h-10 rounded-[var(--radius-control)] border border-line bg-surface px-3 font-normal"
          >
            {AUTO_LOCK.map((m) => (
              <option key={m} value={m}>
                {m === 1 ? '1 minute' : `${String(m)} minutes`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Clear copied passwords after
          <select
            value={clipboard}
            onChange={(e) => {
              setClipboard(Number(e.target.value));
            }}
            className="h-10 rounded-[var(--radius-control)] border border-line bg-surface px-3 font-normal"
          >
            {CLIPBOARD.map((s) => (
              <option key={s} value={s}>
                {s < 60
                  ? `${String(s)} seconds`
                  : s === 60
                    ? '1 minute'
                    : `${String(s / 60)} minutes`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-muted">
        Clearing works only while this tab is open and focused. Clipboard history and other apps can
        keep a copy, so treat copied passwords with care.
      </p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" disabled={!changed} busy={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

const masterSchema = z
  .object({
    current: z.string().min(1, 'Enter your current master password.'),
    next: z.string().min(12, 'Use at least 12 characters.').max(1024),
    confirm: z.string(),
    accountPassword: z.string().min(1, 'Enter your account password.').max(128),
  })
  .refine((v) => v.next === v.confirm, {
    path: ['confirm'],
    message: 'The two entries do not match.',
  });
type MasterValues = z.infer<typeof masterSchema>;

function MasterPassword() {
  const vault = useUnlockedVault();
  const form = useForm<MasterValues>({
    resolver: zodResolver(masterSchema),
    defaultValues: { current: '', next: '', confirm: '', accountPassword: '' },
  });
  const next = useWatch({ control: form.control, name: 'next' });
  const [error, setError] = useState<string | null>(null);

  async function submit(values: MasterValues) {
    setError(null);
    if (values.next === values.accountPassword) {
      form.setError('next', { message: 'Use a different password from your account password.' });
      return;
    }
    if (values.next === values.current) {
      form.setError('next', { message: 'Choose a password you have not used for this vault.' });
      return;
    }
    if ((await estimateStrength(values.next)).score < 3) {
      form.setError('next', { message: 'Choose a stronger master password.' });
      return;
    }
    try {
      const info = await vaultApi.get();
      // Same vault key, wrapped again under the new password with a fresh salt.
      const material = await changeMasterPassword(
        values.current,
        values.next,
        info.material,
        getArgon2(),
      );
      const { keyVersion } = await vaultApi.replaceKeyMaterial(
        values.accountPassword,
        vault.keyVersion,
        material,
      );
      setKeyVersion(keyVersion);
      form.reset();
      toast('Master password changed');
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="flex max-w-md flex-col gap-4">
      <PasswordField
        label="Current master password"
        autoComplete="off"
        error={form.formState.errors.current?.message}
        {...form.register('current')}
      />
      <PasswordField
        label="New master password"
        autoComplete="off"
        error={form.formState.errors.next?.message}
        {...form.register('next')}
      />
      <StrengthMeter password={next} />
      <PasswordField
        label="Confirm new master password"
        autoComplete="off"
        error={form.formState.errors.confirm?.message}
        {...form.register('confirm')}
      />
      <PasswordField
        label="Account password"
        autoComplete="current-password"
        hint="Required for this change, so a session alone is not enough."
        error={form.formState.errors.accountPassword?.message}
        {...form.register('accountPassword')}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" busy={form.formState.isSubmitting}>
          Change master password
        </Button>
      </div>
      <p className="text-sm text-muted">
        Your items stay encrypted with the same vault key, so nothing has to be re-encrypted. Anyone
        who already had an old copy of your vault data and your old master password could still open
        it.
      </p>
    </form>
  );
}

export function SettingsPage() {
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Section title="Appearance" description="Saved in this browser only.">
        <Appearance />
      </Section>
      <Section
        title="Locking and clipboard"
        description="Stored encrypted in your vault, so they apply on every device."
      >
        <LockAndClipboard />
      </Section>
      <Section title="Master password" description="Unlocks your vault. Never sent to the server.">
        <MasterPassword />
      </Section>
    </div>
  );
}
