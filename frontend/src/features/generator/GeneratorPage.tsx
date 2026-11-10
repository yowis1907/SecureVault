import { Copy, RefreshCw } from 'lucide-react';
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

  function update(next: GeneratorOptions) {
    setOptions(next);
    setPassword(generatePassword(next));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Password generator</h1>
      <p className="mt-1 text-sm text-muted">
        Generated on this device from the browser's cryptographic random source.
      </p>

      <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
        <output
          aria-live="polite"
          aria-label="Generated password"
          className="secret block min-h-14 text-xl leading-snug sm:text-2xl"
        >
          {password}
        </output>
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
            }}
          >
            <RefreshCw size={16} aria-hidden="true" /> Generate another
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
