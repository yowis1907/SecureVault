import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { estimateStrength, STRENGTH_LABELS, type Strength } from '../lib/strength';

const barColor = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-accent', 'bg-accent'] as const;
const SEPARATOR = '\n';

type Result = Strength & { password: string };

/**
 * Estimates strength locally as the user types (debounced). The password never leaves the page.
 * Display only: forms that require a minimum score compute it again when submitted.
 */
export function StrengthMeter({
  password,
  userInputs = [],
}: {
  password: string;
  userInputs?: string[];
}) {
  const [result, setResult] = useState<Result | null>(null);
  const inputsKey = userInputs.join(SEPARATOR);

  useEffect(() => {
    if (!password) return;
    let cancelled = false;
    const id = setTimeout(() => {
      void estimateStrength(password, inputsKey.split(SEPARATOR)).then((r) => {
        if (!cancelled) setResult({ ...r, password });
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [password, inputsKey]);

  // A result for an earlier value is not shown, so the meter never describes the wrong password.
  const strength = result && result.password === password ? result : null;

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="grid grid-cols-5 gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={clsx(
              'h-1 rounded-full',
              strength && i <= strength.score ? barColor[strength.score] : 'bg-line',
            )}
          />
        ))}
      </div>
      {strength ? (
        <p className="text-sm text-muted">
          <span className="font-medium text-text">{STRENGTH_LABELS[strength.score]}.</span>{' '}
          {strength.warning ?? `Estimated time to guess offline: ${strength.crackTime}.`}
        </p>
      ) : (
        <p className="text-sm text-muted">Strength is checked on this device only.</p>
      )}
    </div>
  );
}
