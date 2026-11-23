import { ArrowRight, Cpu, KeyRound, ServerOff, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../../components/layout/Wordmark';
import { bytesToBase64 } from '../../crypto/encoding';
import { encryptRecord } from '../../crypto/records';
import { useReveal } from '../../lib/motion';

/**
 * Encrypts what the visitor types with the real record format and a throwaway key that exists
 * only in this page's memory, then shows what a server would receive.
 */
function SealDemo() {
  const inputId = useId();
  const [text, setText] = useState('correct horse battery staple');
  const [sealed, setSealed] = useState('');
  const [generation, setGeneration] = useState(0);
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
        if (cancelled) return;
        setSealed(bytesToBase64(blob.ciphertext));
        setGeneration((g) => g + 1);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, ids, text]);

  return (
    <div className="relative mx-auto w-full max-w-[1040px] pt-6 pb-8">
      {/* Floating glass badges layered over the card, as in the design. */}
      <p className="glass-clear absolute top-0 left-6 z-10 hidden items-center gap-2 rounded-full px-4 py-2 text-[0.8125rem] sm:left-16 sm:flex">
        <KeyRound size={16} className="text-accent" aria-hidden="true" />
        Key derived on device · Argon2id, 64 MiB
      </p>
      <div className="glass grid items-stretch gap-0 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col gap-3.5 p-7 sm:p-10">
          <label
            htmlFor={inputId}
            className="text-xs font-medium tracking-wide text-muted uppercase"
          >
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
            className="secret h-14 w-full rounded-[18px] border border-line/60 bg-surface/70 px-5 text-[0.9375rem] transition-shadow focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--sv-accent)_18%,transparent)] focus:outline-none"
          />
          <p className="text-[0.8125rem] text-muted">
            Type anything. It is encrypted here, with a key that never leaves this page.
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 px-2 pb-2 md:pb-0">
          <span
            aria-hidden="true"
            className="flex size-14 rotate-90 items-center justify-center rounded-full bg-accent-fill text-on-accent shadow-[0_8px_24px_-6px_color-mix(in_oklab,var(--sv-accent-fill)_70%,transparent)] md:rotate-0"
          >
            <ArrowRight size={22} />
          </span>
          <span className="text-xs font-medium text-muted">AES-256-GCM</span>
        </div>
        <div className="flex flex-col gap-3.5 p-7 sm:p-10">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            What the server stores
          </p>
          <p
            key={generation}
            aria-live="off"
            className="secret cipher-flash max-h-[6.5rem] overflow-hidden rounded-[18px] border border-line/60 bg-surface/70 px-5 py-4 text-[0.8125rem] leading-relaxed text-muted"
          >
            {sealed || '…'}
          </p>
          <p className="text-[0.8125rem] text-muted">
            Padded to 256-byte steps, so even short secrets look alike.
          </p>
        </div>
      </div>
      <p className="glass-clear absolute right-6 bottom-0 z-10 hidden items-center gap-2 rounded-full px-4 py-2 text-[0.8125rem] sm:right-24 sm:flex">
        <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
        The server never sees the key
      </p>
    </div>
  );
}

const STEPS = [
  {
    icon: KeyRound,
    title: 'Derive',
    body: 'Your master password becomes a key on this device. Argon2id makes every guess expensive, and the password itself is never sent.',
  },
  {
    icon: Cpu,
    title: 'Seal',
    body: 'Each login is encrypted whole with AES-256-GCM, so the server cannot see which sites you use or swap fields between items.',
  },
  {
    icon: ServerOff,
    title: 'Store',
    body: 'The server checks a separate account password to sign you in, then keeps ciphertext it cannot open.',
  },
];

const LIMITS = [
  'A server that has been taken over could send code that captures your master password at the next unlock. This is a limit of every password manager that runs in a browser.',
  'Malware or a malicious extension can read what you see while the vault is open.',
  'A weak master password can be guessed offline if the database is stolen. The strength check helps you avoid one.',
  'If you forget your master password, the vault cannot be recovered.',
];

function Reveal({
  as: Tag = 'div',
  index = 0,
  className,
  children,
}: {
  as?: 'div' | 'li';
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useReveal<HTMLDivElement & HTMLLIElement>();
  return (
    <Tag ref={ref} className={`reveal ${className ?? ''}`} style={{ ['--i' as string]: index }}>
      {children}
    </Tag>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Floating glass navigation capsule. */}
      <header className="sticky top-0 z-30 px-4 pt-6">
        <nav
          aria-label="Account"
          className="glass-bar mx-auto flex h-14 w-full max-w-[1000px] items-center justify-between rounded-full py-2 pr-2 pl-3"
        >
          <Wordmark />
          <div className="flex items-center gap-1">
            <a
              href="#how"
              className="hidden rounded-full px-3.5 py-2 text-[0.9375rem] text-muted transition-colors hover:text-text sm:block"
            >
              How it works
            </a>
            <a
              href="#limits"
              className="hidden rounded-full px-3.5 py-2 text-[0.9375rem] text-muted transition-colors hover:text-text sm:block"
            >
              Security
            </a>
            <Link
              to="/login"
              className="rounded-full px-3.5 py-2 text-[0.9375rem] whitespace-nowrap text-muted transition-colors hover:text-text"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-accent-fill px-4 py-2 text-[0.9375rem] font-medium whitespace-nowrap text-on-accent transition hover:brightness-110"
            >
              Create a vault
            </Link>
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1 px-4">
        <section className="mx-auto flex max-w-5xl flex-col items-center pt-20 pb-14 text-center sm:pt-28">
          <p className="glass-clear rise flex items-center gap-2 rounded-full px-4 py-1.5 text-[0.8125rem] text-muted">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            Zero-knowledge · Encrypted on your device
          </p>
          <h1 className="display rise mt-7 text-[2.75rem] leading-[1.04] font-semibold sm:text-[5rem]">
            Your passwords.
            <br />
            Sealed before they leave.
          </h1>
          <p className="rise mt-6 max-w-[40rem] text-lg text-muted sm:text-[1.3125rem] sm:leading-[1.45]">
            SecureVault encrypts every login on this device with a key only your master password can
            make. The server keeps sealed data it can never open.
          </p>
          <div className="rise mt-9 flex flex-wrap justify-center gap-3">
            <Link
              to="/register"
              className="group inline-flex h-[52px] items-center gap-2 rounded-full bg-accent-fill px-7 text-base font-medium text-on-accent shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--sv-accent-fill)_70%,transparent)] transition hover:brightness-110"
            >
              Create a vault
              <ArrowRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <a
              href="#how"
              className="glass-clear inline-flex h-[52px] items-center rounded-full px-7 text-base font-medium transition-colors hover:bg-[var(--sv-glass-strong)]"
            >
              See how it works
            </a>
          </div>
        </section>

        <Reveal>
          <SealDemo />
        </Reveal>

        <section
          id="how"
          aria-labelledby="how-heading"
          className="mx-auto max-w-[1040px] scroll-mt-28 pt-28 pb-10"
        >
          <Reveal className="text-center">
            <p className="eyebrow">How it works</p>
            <h2 id="how-heading" className="mt-3 text-[2.5rem] leading-[1.15] font-semibold">
              The key never leaves your device.
            </h2>
          </Reveal>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <Reveal as="li" key={step.title} index={i}>
                  <div className="glass flex h-full flex-col p-8">
                    <span className="flex size-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <h3 className="mt-6 text-[1.3125rem] font-semibold">{step.title}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{step.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </ol>
        </section>

        <section
          id="limits"
          aria-labelledby="limits-heading"
          className="mx-auto max-w-[1040px] scroll-mt-28 pt-16 pb-28"
        >
          <Reveal className="glass grid gap-10 p-8 sm:p-14 md:grid-cols-[1fr_1.7fr]">
            <div>
              <p className="eyebrow text-warn">Honest limits</p>
              <h2 id="limits-heading" className="mt-3 text-[1.75rem] leading-tight font-semibold">
                What it cannot protect against
              </h2>
              <p className="mt-3 text-[0.9375rem] text-muted">
                Knowing the limits helps you decide what to store.
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {LIMITS.map((limit) => (
                <li key={limit} className="flex gap-3.5 text-[1.0625rem] leading-relaxed">
                  <span
                    className="mt-[0.7rem] size-1.5 flex-none rounded-full bg-muted"
                    aria-hidden="true"
                  />
                  {limit}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>
      </main>

      <footer className="px-4 pb-12 text-center text-[0.8125rem] text-muted">
        SecureVault is a security engineering project. It has not been independently audited.
      </footer>
    </div>
  );
}
