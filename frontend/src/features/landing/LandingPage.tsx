import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../../components/layout/Wordmark';
import { bytesToBase64 } from '../../crypto/encoding';
import { encryptRecord } from '../../crypto/records';

/**
 * Encrypts what the visitor types with the real record format and a throwaway key that exists
 * only in this page's memory, then shows what a server would receive.
 */
function SealDemo() {
  const inputId = useId();
  const [text, setText] = useState('correct horse battery staple');
  const [sealed, setSealed] = useState('');
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [ids] = useState(() => ({ vaultId: crypto.randomUUID(), recordId: crypto.randomUUID() }));

  useEffect(() => {
    void crypto.subtle
      .generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      .then(setKey);
  }, []);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void encryptRecord(key, { ...ids, recordType: 'LOGIN' }, { schema: 1, password: text }).then(
      (blob) => {
        if (!cancelled) setSealed(bytesToBase64(blob.ciphertext));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, ids, text]);

  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-surface">
      <div className="border-b border-line p-4 sm:p-5">
        <label htmlFor={inputId} className="text-sm font-medium">
          On your device
        </label>
        <input
          id={inputId}
          value={text}
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
          }}
          className="secret mt-2 h-11 w-full rounded-[var(--radius-control)] border border-line bg-bg px-3 text-base"
        />
        <p className="mt-2 text-xs text-muted">
          Type anything. It is encrypted here with a key that never leaves this page.
        </p>
      </div>
      <div className="p-4 sm:p-5">
        <p className="text-sm font-medium">What the server stores</p>
        <p
          aria-live="off"
          className="secret mt-2 max-h-40 overflow-hidden text-xs leading-relaxed text-muted [mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
        >
          {sealed || '…'}
        </p>
        <p className="mt-3 text-xs text-muted">
          The length is padded to 256-byte steps, so even short secrets look alike.
        </p>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Your master password becomes a key on your device',
    body: 'Argon2id stretches it with 64 MiB of memory work, which makes every guess expensive. The password itself is never sent anywhere.',
  },
  {
    title: 'Each item is sealed whole',
    body: 'Title, username, password, address and notes are encrypted together with AES-256-GCM, so the server cannot see which sites you use or swap fields between items.',
  },
  {
    title: 'The server keeps ciphertext it cannot open',
    body: 'It checks your separate account password to sign you in, then stores and returns sealed items. It holds no key that could read them.',
  },
];

const LIMITS = [
  'A server that has been taken over could send modified code that captures your master password the next time you unlock. This is a limit of every password manager that runs in a browser.',
  'Malware or a malicious extension on your device can read what you see while the vault is unlocked.',
  'A weak master password can be guessed offline if the database is stolen. The strength check helps you avoid one.',
  'If you forget your master password, your vault cannot be recovered.',
];

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-[var(--radius-control)] px-3 py-2 text-sm hover:bg-surface-2"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-[var(--radius-control)] bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong"
          >
            Create a vault
          </Link>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1.05fr_1fr] md:py-20">
          <div>
            <h1 className="max-w-[16ch] text-3xl leading-[1.1] font-semibold tracking-tight sm:text-[3.2rem]">
              Your passwords are encrypted before they leave this page.
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg text-muted">
              SecureVault keeps your logins in a vault that only your master password opens. The
              server stores sealed data and never receives the key.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="rounded-[var(--radius-control)] bg-accent px-5 py-3 font-medium text-on-accent hover:bg-accent-strong"
              >
                Create a vault
              </Link>
              <Link
                to="/login"
                className="rounded-[var(--radius-control)] border border-line px-5 py-3 font-medium hover:bg-surface-2"
              >
                Sign in
              </Link>
            </div>
          </div>
          <SealDemo />
        </section>

        <section aria-labelledby="how" className="border-t border-line py-14">
          <h2 id="how" className="text-xl font-semibold tracking-tight">
            How your vault is protected
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="font-mono text-sm text-accent">{String(i + 1)}</span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="limits" className="border-t border-line py-14">
          <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
            <div>
              <h2 id="limits" className="text-xl font-semibold tracking-tight">
                What it cannot protect against
              </h2>
              <p className="mt-3 text-sm text-muted">
                Knowing the limits helps you decide what to store and how to protect your device.
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {LIMITS.map((limit) => (
                <li key={limit} className="py-4 text-sm">
                  {limit}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted">
          SecureVault is a security engineering project. It has not been independently audited, so
          do not use it for passwords you cannot afford to lose.
        </p>
      </footer>
    </div>
  );
}
