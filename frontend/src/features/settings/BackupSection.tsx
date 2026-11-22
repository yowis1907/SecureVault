import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState, type SyntheticEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { PasswordField } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { messageFor } from '../../lib/errors';
import { estimateStrength } from '../../lib/strength';
import { exportBackup, importBackup } from '../../vault-session/session';

const exportSchema = z
  .object({
    passphrase: z.string().min(12, 'Use at least 12 characters.').max(1024),
    confirm: z.string(),
  })
  .refine((v) => v.passphrase === v.confirm, {
    path: ['confirm'],
    message: 'The two entries do not match.',
  });
type ExportValues = z.infer<typeof exportSchema>;

/** Offers the file as a download. The text never leaves the device in any other way. */
function download(fileText: string) {
  const blob = new Blob([fileText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `securevault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked after the browser has started the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

function ExportBackup() {
  const form = useForm<ExportValues>({
    resolver: zodResolver(exportSchema),
    defaultValues: { passphrase: '', confirm: '' },
  });
  const passphrase = useWatch({ control: form.control, name: 'passphrase' });
  const [error, setError] = useState<string | null>(null);

  async function submit(values: ExportValues) {
    setError(null);
    if ((await estimateStrength(values.passphrase)).score < 3) {
      form.setError('passphrase', {
        message: 'Choose a stronger passphrase. It alone protects the backup file.',
      });
      return;
    }
    try {
      download(await exportBackup(values.passphrase));
      form.reset();
      toast('Encrypted backup downloaded');
    } catch (e) {
      setError(messageFor(e));
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(submit)} className="flex max-w-md flex-col gap-4">
      <h3 className="font-medium">Download a backup</h3>
      <PasswordField
        label="Backup passphrase"
        autoComplete="off"
        hint="Separate from your master password. Anyone with the file and this passphrase can read everything in it."
        error={form.formState.errors.passphrase?.message}
        {...form.register('passphrase')}
      />
      <StrengthMeter password={passphrase} />
      <PasswordField
        label="Confirm backup passphrase"
        autoComplete="off"
        error={form.formState.errors.confirm?.message}
        {...form.register('confirm')}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" busy={form.formState.isSubmitting}>
          Download encrypted backup
        </Button>
      </div>
    </form>
  );
}

function ImportBackup() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a backup file.');
      return;
    }
    if (!passphrase) {
      setError('Enter the passphrase this backup was made with.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('This file is too large to be a SecureVault backup.');
      return;
    }
    setBusy(true);
    try {
      const result = await importBackup(await file.text(), passphrase);
      setPassphrase('');
      if (fileRef.current) fileRef.current.value = '';
      toast(
        `Imported ${String(result.logins)} ${result.logins === 1 ? 'login' : 'logins'} and ${String(result.categories)} new ${result.categories === 1 ? 'category' : 'categories'}.`,
      );
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="flex max-w-md flex-col gap-4">
      <h3 className="font-medium">Import a backup</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="backup-file" className="text-sm font-medium">
          Backup file
        </label>
        <input
          id="backup-file"
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="text-sm file:mr-3 file:rounded-[var(--radius-control)] file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-text"
        />
      </div>
      <PasswordField
        label="Passphrase for this backup"
        autoComplete="off"
        value={passphrase}
        onChange={(e) => {
          setPassphrase(e.target.value);
        }}
      />
      <p className="text-sm text-muted">
        Items are added to this vault with new IDs. Nothing is replaced, so importing the same file
        twice creates copies.
      </p>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" variant="secondary" busy={busy}>
          {busy ? 'Importing' : 'Import backup'}
        </Button>
      </div>
    </form>
  );
}

export function BackupSection() {
  return (
    <div className="flex flex-col gap-8">
      <ExportBackup />
      <ImportBackup />
    </div>
  );
}
