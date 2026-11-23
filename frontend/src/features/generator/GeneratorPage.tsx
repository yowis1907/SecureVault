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
import { useDecodeText } from '../../lib/motion';
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

  function update(next: GeneratorOptions) {
    setOptions(next);
    setPassword(generatePassword(next));
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-[2.5rem] leading-tight font-semibold">Password generator</h1>
        <p className="mt-1 text-[0.9375rem] text-muted">
          Made on this device from the browser&apos;s cryptographic random source.
        </p>
      </div>

      <div className="glass p-7 sm:p-9">
        {/* Announced once per new password; the animated text below is visual only. */}
        <output aria-live="polite" aria-label="Generated password" className="sr-only">
          {password}
        </output>
        <p
          aria-hidden="true"
          className={clsx(
            'secret min-h-14 text-2xl leading-snug transition-colors duration-300 sm:text-[2.125rem]',
            !settled && 'text-accent',
          )}
        >
          {decoded}
        </p>
        <div className="mt-6">
          <StrengthMeter password={password} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2.5">
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
      </div>

      <fieldset className="glass flex flex-col px-7 py-3 sm:px-9">
        <legend className="sr-only">Options</legend>
        <div className="flex flex-col gap-3 py-5">
          <label htmlFor="length" className="flex justify-between text-[1.0625rem]">
            Length <span className="font-semibold tabular-nums">{options.length}</span>
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
            className="w-full accent-[var(--sv-accent)]"
          />
          <p className="text-[0.8125rem] text-muted">
            About {entropyBits(options)} bits of randomness. 80 or more resists any realistic
            guessing.
          </p>
        </div>
        {TYPES.map(([key, label, sample]) => (
          <label
            key={key}
            className="flex cursor-pointer items-center gap-3 border-t border-line/70 py-3.5 text-[1.0625rem]"
          >
            <span className="flex-1">
              {label} <span className="secret text-[0.9375rem] text-muted">{sample}</span>
            </span>
            <input
              type="checkbox"
              checked={options[key]}
              // The last selected type cannot be turned off; a password needs some characters.
              disabled={options[key] && selectedTypes === 1}
              onChange={(e) => {
                update({ ...options, [key]: e.target.checked });
              }}
              className="switch"
            />
          </label>
        ))}
        <label className="flex cursor-pointer items-center gap-3 border-t border-line/70 py-3.5 text-[1.0625rem]">
          <span className="flex-1">
            Avoid look-alike characters{' '}
            <span className="secret text-[0.9375rem] text-muted">I l 1 O 0</span>
          </span>
          <input
            type="checkbox"
            checked={options.avoidAmbiguous}
            onChange={(e) => {
              update({ ...options, avoidAmbiguous: e.target.checked });
            }}
            className="switch"
          />
        </label>
      </fieldset>
    </div>
  );
}
