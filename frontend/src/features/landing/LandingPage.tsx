import { ArrowRight, Cpu, KeyRound, ServerOff } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../../components/layout/Wordmark';
import { SceneBackdrop } from '../../components/scene/SceneBackdrop';
import { pulseScene } from '../../components/scene/signal';
import { bytesToBase64 } from '../../crypto/encoding';
import { encryptRecord } from '../../crypto/records';
import { useDecodeText, useReveal } from '../../lib/motion';

/**
 * Encrypts what the visitor types with the real record format and a throwaway key that exists
 * only in this page's memory, then shows what a server would receive. Each keystroke also turns
 * the vault's locking wheel, so the cause and the effect sit side by side.
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
    <div className="panel overflow-hidden">
      <div className="border-b border-line p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="eyebrow">
            On your device
          </label>
          <span className="text-xs text-muted">plaintext</span>
        </div>
        <input
          id={inputId}
          value={text}
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            pulseScene(0.35);
          }}
          className="secret mt-4 h-13 w-full rounded-[var(--radius-control)] border border-line bg-bg px-4 text-base transition-shadow focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--sv-accent)_22%,transparent)]"
        />
        <p className="mt-3 text-xs text-muted">
          Type anything. It is encrypted here with a key that never leaves this page.
        </p>
      </div>
      <div className="bg-bg/40 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <p className="eyebrow">What the server stores</p>
          <span className="font-mono text-xs text-muted">AES-256-GCM · {sealed.length} chars</span>
        </div>
        <p
          key={generation}
          aria-live="off"
          className="secret cipher-flash mt-4 max-h-32 overflow-hidden text-xs leading-relaxed text-muted [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
        >
          {sealed || '…'}
        </p>
        <p className="mt-4 text-xs text-muted">
          The length is padded to 256-byte steps, so even short secrets look alike.
        </p>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: KeyRound,
    label: 'Derive',
    title: 'Your master password becomes a key on your device',
    body: 'Argon2id stretches it with 64 MiB of memory work, which makes every guess expensive. The password itself is never sent anywhere.',
  },
  {
    icon: Cpu,
    label: 'Seal',
    title: 'Each item is sealed whole',
    body: 'Title, username, password, address and notes are encrypted together with AES-256-GCM, so the server cannot see which sites you use or swap fields between items.',
  },
  {
    icon: ServerOff,
    label: 'Store',
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

function StepCard({ step, index }: { step: (typeof STEPS)[number]; index: number }) {
  const Icon = step.icon;
  return (
    <Reveal as="li" index={index}>
      <div className="panel group flex h-full flex-col p-8 transition-transform duration-500 hover:-translate-y-1">
        <span className="font-display text-6xl leading-none font-semibold text-accent/25 transition-colors duration-500 group-hover:text-accent/60">
          0{index + 1}
        </span>
        <span className="mt-8 flex items-center gap-2 text-sm font-medium text-accent">
          <Icon size={16} aria-hidden="true" />
          {step.label}
        </span>
        <h3 className="display mt-3 text-xl font-semibold">{step.title}</h3>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">{step.body}</p>
      </div>
    </Reveal>
  );
}

const HEADLINE = 'Your passwords are encrypted before they leave this page.';

export function LandingPage() {
  const decoded = useDecodeText(HEADLINE);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <div
        className="spotlight pointer-events-none absolute inset-x-0 top-0 h-[120vh]"
        aria-hidden="true"
      />
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-1">
          <Link
            to="/login"
            className="rounded-full px-3 py-2 text-sm whitespace-nowrap text-muted transition-colors hover:text-text sm:px-4"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="cta rounded-full bg-text px-4 py-2 text-sm font-medium whitespace-nowrap text-bg"
          >
            Create a vault
          </Link>
        </nav>
      </header>

      <main id="main" className="relative flex-1">
        {/* Hero: centred type, then the vault itself, like a product shot. */}
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-4 px-6 pt-12 text-center sm:pt-16 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.05fr_1fr] lg:pt-0 lg:text-left">
          <div>
            <p className="eyebrow">Zero-knowledge password manager</p>
            <h1 className="display mx-auto mt-6 max-w-[15ch] text-[2.7rem] leading-[1.02] font-semibold sm:text-[4.2rem] lg:mx-0">
              <span className="sr-only">{HEADLINE}</span>
              <span aria-hidden="true">{decoded}</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[44ch] text-lg text-muted lg:mx-0">
              SecureVault keeps your logins in a vault that only your master password opens. The
              server stores sealed data and never receives the key.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                to="/register"
                className="cta group inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 font-semibold text-on-accent"
              >
                Create a vault
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center rounded-full border border-line px-7 py-3.5 font-medium transition-colors hover:border-text/40"
              >
                Sign in
              </Link>
            </div>
          </div>
          <SceneBackdrop
            intensity="hero"
            className="vault-stage relative h-[52vh] max-h-[640px] min-h-[340px] w-full lg:h-[72vh]"
          />
        </section>

        <section
          id="try"
          aria-labelledby="try-heading"
          className="relative mx-auto w-full max-w-6xl px-6 py-24"
        >
          <Reveal className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="eyebrow">Live demo</p>
              <h2 id="try-heading" className="display mt-4 max-w-[16ch] text-4xl font-semibold">
                Type a secret. See what the server gets.
              </h2>
              <p className="mt-5 max-w-[44ch] text-muted">
                This runs the same record encryption as the vault, with a key made for this page
                alone. Every keystroke turns the lock and produces entirely new ciphertext.
              </p>
              <SceneBackdrop intensity="ambient" className="relative mt-4 hidden h-72 lg:block" />
            </div>
            <SealDemo />
          </Reveal>
        </section>

        <section aria-labelledby="how" className="relative mx-auto w-full max-w-6xl px-6 py-24">
          <Reveal className="text-center">
            <p className="eyebrow">How it works</p>
            <h2 id="how" className="display mx-auto mt-4 max-w-[20ch] text-4xl font-semibold">
              The key never leaves your device.
            </h2>
          </Reveal>
          <ol className="mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <StepCard key={step.title} step={step} index={i} />
            ))}
          </ol>
        </section>

        <section aria-labelledby="limits" className="relative mx-auto w-full max-w-6xl px-6 pb-28">
          <div className="panel grid gap-10 p-8 sm:p-12 md:grid-cols-[1fr_1.5fr]">
            <Reveal>
              <p className="eyebrow">Honest limits</p>
              <h2 id="limits" className="display mt-4 text-3xl font-semibold">
                What it cannot protect against
              </h2>
              <p className="mt-4 text-sm text-muted">
                Knowing the limits helps you decide what to store and how to protect your device.
              </p>
            </Reveal>
            <ul className="flex flex-col">
              {LIMITS.map((limit, i) => (
                <Reveal
                  as="li"
                  key={limit}
                  index={i}
                  className="flex gap-5 border-t border-line py-5 text-[0.95rem] first:border-t-0 first:pt-0"
                >
                  <span className="font-mono text-xs text-accent">0{i + 1}</span>
                  <span>{limit}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-line">
        <p className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted">
          SecureVault is a security engineering project. It has not been independently audited, so
          do not use it for passwords you cannot afford to lose.
        </p>
      </footer>
    </div>
  );
}
