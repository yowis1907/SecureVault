import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldCheck, ShieldOff } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useMemo, useState, type SyntheticEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Notice, Spinner } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { account, type MfaSetup } from '../../lib/api/endpoints';
import { messageFor } from '../../lib/errors';
import { copySecret } from '../../vault-session/clipboard';

/**
 * A QR code drawn as SVG paths from the module grid. No HTML strings are involved, so it works
 * under Trusted Types. The URI holds the secret and stays in memory only.
 */
function QrCode({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${String(c)} ${String(r)}h1v1h-1z`;
      }
    }
    return { size: n, path: d };
  }, [text]);
  return (
    <svg
      role="img"
      aria-label="QR code for your authenticator app"
      viewBox={`-4 -4 ${String(size + 8)} ${String(size + 8)}`}
      className="size-48 rounded-2xl bg-white p-1 shadow-[0_6px_20px_-8px_rgb(0_0_0/0.25)]"
      shapeRendering="crispEdges"
    >
      <path d={path} fill="#1d1d1f" />
    </svg>
  );
}

/** Recovery codes, shown once. Copying clears the clipboard after a minute. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join('\n');
  function download() {
    const blob = new Blob(
      [
        `SecureVault recovery codes\nEach code signs you in once if you lose your authenticator app.\n\n${text}\n`,
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'securevault-recovery-codes.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 10_000);
  }
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warn" title="Save these recovery codes now">
        They are shown only once. Each one signs you in a single time if you lose your phone.
        Without them and without your phone, you cannot sign in.
      </Notice>
      <ul className="well secret grid grid-cols-2 gap-x-6 gap-y-2 p-5 text-[0.9375rem]">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" onClick={download}>
          <Download size={16} aria-hidden="true" /> Download
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            copySecret(text, 60).then(
              () => {
                toast('Copied. The clipboard clears in 60 seconds if this tab stays open.');
              },
              () => {
                toast('The browser did not allow copying. Download the codes instead.', 'error');
              },
            );
          }}
        >
          Copy
        </Button>
        <Button onClick={onDone}>I have saved them</Button>
      </div>
    </div>
  );
}

type Step =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; setup: MfaSetup }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'disable' }
  | { kind: 'regenerate' };

export function TwoFactorSection() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['mfa'], queryFn: account.mfaStatus });
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(next: Step = { kind: 'idle' }) {
    setStep(next);
    setPassword('');
    setCode('');
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(handler: () => Promise<void>) {
    return (event: SyntheticEvent) => {
      event.preventDefault();
      void run(handler);
    };
  }

  if (status.isPending) return <Spinner label="Loading two-factor settings" />;
  if (status.isError) return <Notice tone="danger">{messageFor(status.error)}</Notice>;

  const enabled = status.data.enabled;
  const errorNotice = error ? <Notice tone="danger">{error}</Notice> : null;

  if (step.kind === 'codes') {
    return (
      <RecoveryCodes
        codes={step.codes}
        onDone={() => {
          reset();
          void queryClient.invalidateQueries({ queryKey: ['mfa'] });
        }}
      />
    );
  }

  if (step.kind === 'password' || step.kind === 'regenerate') {
    const regenerate = step.kind === 'regenerate';
    return (
      <form
        noValidate
        className="flex max-w-md flex-col gap-4"
        onSubmit={onSubmit(async () => {
          if (regenerate) {
            const { recoveryCodes } = await account.mfaRecoveryCodes(password);
            reset({ kind: 'codes', codes: recoveryCodes });
          } else {
            const setup = await account.mfaSetup(password);
            reset({ kind: 'scan', setup });
          }
        })}
      >
        <PasswordField
          label="Account password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          hint={
            regenerate
              ? 'Your old recovery codes will stop working.'
              : 'Confirm it is you before changing how you sign in.'
          }
        />
        {errorNotice}
        <div className="flex gap-2.5">
          <Button type="submit" busy={busy}>
            Continue
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  if (step.kind === 'scan') {
    return (
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={onSubmit(async () => {
          const { recoveryCodes } = await account.mfaEnable(code.trim());
          toast('Two-factor sign-in is on');
          reset({ kind: 'codes', codes: recoveryCodes });
        })}
      >
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-[0.9375rem] text-muted">
          <li>Open an authenticator app, such as Google Authenticator, Authy, or 1Password.</li>
          <li>Scan the code, or type the key by hand.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-6">
          <QrCode text={step.setup.otpauthUri} />
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-medium text-muted">Key for manual entry</p>
            <p className="secret mt-1 text-[0.9375rem] break-all">
              {step.setup.secret.replace(/(.{4})/g, '$1 ').trim()}
            </p>
          </div>
        </div>
        <div className="max-w-xs">
          <TextField
            label="6-digit code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ''));
            }}
            className="secret text-center text-xl tracking-[0.4em]"
          />
        </div>
        {errorNotice}
        <div className="flex gap-2.5">
          <Button type="submit" busy={busy}>
            Turn on
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  if (step.kind === 'disable') {
    return (
      <form
        noValidate
        className="flex max-w-md flex-col gap-4"
        onSubmit={onSubmit(async () => {
          await account.mfaDisable(password, code.trim());
          toast('Two-factor sign-in is off');
          reset();
          await queryClient.invalidateQueries({ queryKey: ['mfa'] });
        })}
      >
        <PasswordField
          label="Account password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <TextField
          label="Code from your app, or a recovery code"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={20}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
          }}
          className="secret"
        />
        {errorNotice}
        <div className="flex gap-2.5">
          <Button type="submit" variant="danger" busy={busy}>
            Turn off
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return enabled ? (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 font-medium">
        <ShieldCheck size={18} className="text-success" aria-hidden="true" />
        On. {status.data.recoveryCodesRemaining}{' '}
        {status.data.recoveryCodesRemaining === 1 ? 'recovery code' : 'recovery codes'} left.
      </p>
      {status.data.recoveryCodesRemaining <= 3 ? (
        <Notice tone="warn">Few recovery codes are left. Make a new set.</Notice>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <Button
          variant="secondary"
          onClick={() => {
            reset({ kind: 'regenerate' });
          }}
        >
          New recovery codes
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          onClick={() => {
            reset({ kind: 'disable' });
          }}
        >
          <ShieldOff size={16} aria-hidden="true" /> Turn off
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-start gap-4">
      <p className="text-[0.9375rem] text-muted">
        Off. With it on, signing in needs a code from an app on your phone as well as your account
        password, so a stolen password alone is not enough.
      </p>
      <Button
        onClick={() => {
          reset({ kind: 'password' });
        }}
      >
        <ShieldCheck size={16} aria-hidden="true" /> Turn on two-factor sign-in
      </Button>
    </div>
  );
}
