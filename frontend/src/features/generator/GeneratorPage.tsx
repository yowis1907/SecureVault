import { Copy, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { StrengthMeter } from '../../components/StrengthMeter';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toast';
import {
  DEFAULT_OPTIONS,
  entropyBits,
  generatePassword,
  LENGTH_LIMITS,
  type GeneratorOptions,
} from '../../lib/generator';
import { useDecodeText, useTilt } from '../../lib/motion';
import { copySecret } from '../../vault-session/clipboard';
import { useUnlockedVault } from '../../vault-session/hooks';

const TYPES = [
  ['lowercase', 'Lowercase letters', 'a–z'],
  ['uppercase', 'Capital letters', 'A–Z'],
  ['digits', 'Digits', '0–9'],
  ['symbols', 'Symbols', '! # % & …'],
] as const;

export function GeneratorPage() {
  const vault = useUnlockedVault();
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);
  const [password, setPassword] = useState(() => generatePassword(DEFAULT_OPTIONS));
  const selectedTypes = TYPES.filter(([key]) => options[key]).length;
  // New passwords resolve out of random glyphs. Once settled, only the real text is in the DOM,
  // so selecting and copying it by hand gets exactly the password.
  const decoded = useDecodeText(password, 420);
  const settled = decoded === password;
  const [spins, setSpins] = useState(0);
  const tilt = useTilt<HTMLDivElement>(4);

  function update(next: GeneratorOptions) {
    setOptions(next);
    setPassword(generatePassword(next));
  }

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Local randomness</p>
      <h1 className="mt-2 text-3xl font-bold">Password generator</h1>
      <p className="mt-1 text-sm text-muted">
        Generated on this device from the browser's cryptographic random source.
      </p>

      <div ref={tilt} className="tilt glass mt-6 p-5 sm:p-6">
        {/* Announced once per new password; the animated text below is visual only. */}
        <output aria-live="polite" aria-label="Generated password" className="sr-only">
          {password}
        </output>
        <p
          aria-hidden="true"
          className={clsx(
            'secret tilt-pop min-h-14 text-xl leading-snug transition-colors duration-300 sm:text-2xl',
            !settled && 'text-accent',
          )}
        >
          {decoded}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              copySecret(password, vault.settings.clipboardClearSeconds).then(
                () => {
                  toast(
                    `Copied. Clipboard clears in ${String(vault.settings.clipboardClearSeconds)} seconds if this tab stays open.`,
                  );
                },
                () => {
                  toast(
                    'The browser did not allow copying. Select the text and copy it yourself.',
                    'error',
                  );
                },
              );
            }}
          >
            <Copy size={16} aria-hidden="true" /> Copy
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setPassword(generatePassword(options));
              setSpins((n) => n + 1);
            }}
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
              className={clsx(spins > 0 && (spins % 2 ? 'spin-once-a' : 'spin-once-b'))}
            />{' '}
            Generate another
          </Button>
        </div>
        <div className="mt-4">
          <StrengthMeter password={password} />
        </div>
      </div>

      <fieldset className="mt-8 flex flex-col gap-5">
        <legend className="font-semibold">Options</legend>
        <div className="flex flex-col gap-2">
          <label htmlFor="length" className="flex justify-between text-sm font-medium">
            Length <span className="font-mono tabular-nums">{options.length}</span>
          </label>
          <input
            id="length"
            type="range"
            min={LENGTH_LIMITS.min}
            max={64}
            value={options.length}
            onChange={(e) => {
              update({ ...options, length: Number(e.target.value) });
            }}
            className="accent-[var(--sv-accent)]"
          />
          <p className="text-sm text-muted">
            About {entropyBits(options)} bits of randomness. 80 or more resists any realistic
            guessing.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map(([key, label, sample]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={options[key]}
                // The last selected type cannot be turned off; a password needs some characters.
                disabled={options[key] && selectedTypes === 1}
                onChange={(e) => {
                  update({ ...options, [key]: e.target.checked });
                }}
                className="size-4 accent-[var(--sv-accent)]"
              />
              <span>
                {label} <span className="font-mono text-muted">{sample}</span>
              </span>
            </label>
          ))}
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={options.avoidAmbiguous}
              onChange={(e) => {
                update({ ...options, avoidAmbiguous: e.target.checked });
              }}
              className="size-4 accent-[var(--sv-accent)]"
            />
            <span>
              Avoid look-alike characters <span className="font-mono text-muted">I l 1 O 0</span>
            </span>
          </label>
        </div>
      </fieldset>
    </div>
  );
}
