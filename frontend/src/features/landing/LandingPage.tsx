import { ArrowRight, Cpu, KeyRound, ServerOff } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '../../components/layout/Wordmark';
import { SceneBackdrop } from '../../components/scene/SceneBackdrop';
import { pulseScene } from '../../components/scene/signal';
import { bytesToBase64 } from '../../crypto/encoding';
import { encryptRecord } from '../../crypto/records';
import { useDecodeText, useReveal, useTilt } from '../../lib/motion';

/**
 * Encrypts what the visitor types with the real record format and a throwaway key that exists
 * only in this page's memory, then shows what a server would receive. Each keystroke also pulses
 * the 3D scene, so the cause and the effect sit side by side.
 */
function SealDemo() {
  const inputId = useId();
  const [text, setText] = useState('correct horse battery staple');
  const [sealed, setSealed] = useState('');
  const [generation, setGeneration] = useState(0);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [ids] = useState(() => ({ vaultId: crypto.randomUUID(), recordId: crypto.randomUUID() }));
  const tilt = useTilt<HTMLDivElement>(5);

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
    <div ref={tilt} className="tilt glass">
      <div className="tilt-pop border-b border-line/70 p-5">
        <div className="flex items-center justify-between">
          <label htmlFor={inputId} className="eyebrow">
            On your device
          </label>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            plaintext
          </span>
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
          className="secret mt-3 h-12 w-full rounded-[var(--radius-control)] border border-line bg-bg/70 px-3 text-base transition-shadow focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--sv-accent)_25%,transparent)]"
        />
        <p className="mt-2 text-xs text-muted">
          Type anything. It is encrypted here with a key that never leaves this page.
        </p>
      </div>
      <div className="flex items-center gap-2 px-5 pt-4 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        AES-256-GCM
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      </div>
      <div className="p-5 pt-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">What the server stores</p>
          <span className="font-mono text-xs text-muted">{sealed.length} chars</span>
        </div>
        <p
          key={generation}
          aria-live="off"
          className="secret cipher-flash mt-3 max-h-36 overflow-hidden text-xs leading-relaxed text-muted [mask-image:linear-gradient(to_bottom,black_65%,transparent)]"
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
  const tilt = useTilt<HTMLDivElement>(6);
  const Icon = step.icon;
  return (
    <Reveal as="li" index={index}>
      <div ref={tilt} className="tilt glass group h-full p-6">
        <div className="tilt-pop flex items-center justify-between">
          <span className="flex size-11 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent transition-transform duration-300 group-hover:scale-110">
            <Icon size={20} aria-hidden="true" />
          </span>
          <span className="font-mono text-xs text-muted">
            0{index + 1} / {step.label}
          </span>
        </div>
        <h3 className="display tilt-pop mt-6 text-lg font-semibold">{step.title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
      </div>
    </Reveal>
  );
}

const HEADLINE = 'Your passwords are encrypted before they leave this page.';

export function LandingPage() {
  const decoded = useDecodeText(HEADLINE);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      {/* One fixed scene for the whole page: sections scroll over it and it turns as they do. */}
      <SceneBackdrop intensity="hero" className="fixed inset-0" />
      <div className="grid-field pointer-events-none fixed inset-0" aria-hidden="true" />
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors hover:bg-surface-2"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="cta rounded-[var(--radius-control)] bg-accent px-3 py-2 text-sm font-medium text-on-accent"
          >
            Create a vault
          </Link>
        </nav>
      </header>

      <main id="main" className="relative flex-1">
        <section className="relative">
          <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center px-4 py-12">
            <div className="max-w-[36rem]">
              <p className="eyebrow">Zero-knowledge · Argon2id · AES-256-GCM</p>
              <h1 className="display mt-5 max-w-[15ch] text-[2.6rem] leading-[1.02] font-bold sm:text-[3.8rem]">
                <span className="sr-only">{HEADLINE}</span>
                <span aria-hidden="true">{decoded}</span>
              </h1>
              <p className="mt-6 max-w-[48ch] text-lg text-muted">
                SecureVault keeps your logins in a vault that only your master password opens. The
                server stores sealed data and never receives the key.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="cta group inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-6 py-3.5 font-semibold text-on-accent"
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
                  className="glass inline-flex items-center rounded-[var(--radius-control)] px-6 py-3.5 font-medium transition-colors hover:border-accent/50"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
          <a
            href="#try"
            className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-xs text-muted transition-colors hover:text-accent sm:flex"
          >
            Try it
            <span
              className="h-8 w-px animate-pulse bg-gradient-to-b from-accent to-transparent"
              aria-hidden="true"
            />
          </a>
        </section>

        <section
          id="try"
          aria-labelledby="try-heading"
          className="relative mx-auto grid w-full max-w-6xl scroll-mt-8 items-center gap-10 px-4 py-24 lg:grid-cols-[1fr_1fr]"
        >
          <Reveal>
            <p className="eyebrow">Live demo</p>
            <h2 id="try-heading" className="display mt-3 max-w-[18ch] text-3xl font-bold">
              Type a secret and watch what the server would get
            </h2>
            <p className="mt-4 max-w-[46ch] text-muted">
              This runs the same record encryption as the vault, with a key made for this page
              alone. Every keystroke produces entirely new ciphertext.
            </p>
            <div className="mt-8">
              <SealDemo />
            </div>
          </Reveal>
        </section>

        <section aria-labelledby="how" className="relative mx-auto w-full max-w-6xl px-4 py-24">
          <Reveal>
            <p className="eyebrow">How it works</p>
            <h2 id="how" className="display mt-3 max-w-[22ch] text-3xl font-bold">
              Three steps, and the key never leaves your device
            </h2>
          </Reveal>
          <ol className="relative mt-12 grid gap-5 md:grid-cols-3">
            <span
              aria-hidden="true"
              className="absolute top-[2.85rem] right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-accent/0 via-accent/50 to-accent/0 md:block"
            />
            {STEPS.map((step, i) => (
              <StepCard key={step.title} step={step} index={i} />
            ))}
          </ol>
        </section>

        <section aria-labelledby="limits" className="relative mx-auto w-full max-w-6xl px-4 pb-24">
          <div className="glass grid gap-10 p-6 sm:p-10 md:grid-cols-[1fr_1.6fr]">
            <Reveal>
              <p className="eyebrow">Honest limits</p>
              <h2 id="limits" className="display mt-3 text-2xl font-bold">
                What it cannot protect against
              </h2>
              <p className="mt-3 text-sm text-muted">
                Knowing the limits helps you decide what to store and how to protect your device.
              </p>
            </Reveal>
            <ul className="flex flex-col">
              {LIMITS.map((limit, i) => (
                <Reveal
                  as="li"
                  key={limit}
                  index={i}
                  className="flex gap-4 border-t border-line py-4 text-sm first:border-t-0 first:pt-0"
                >
                  <span className="font-mono text-xs text-warn">0{i + 1}</span>
                  <span>{limit}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted">
          SecureVault is a security engineering project. It has not been independently audited, so
          do not use it for passwords you cannot afford to lose.
        </p>
      </footer>
    </div>
  );
}
