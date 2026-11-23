import { clsx } from 'clsx';
import { Lock } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { lock } from '../vault-session/session';

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The vault's state, always visible: a fuse that burns down toward auto-lock. Any activity
 * resets it. Clicking locks immediately. `card` is the sidebar version with a caption;
 * `compact` fits the phone header.
 */
export function LockFuse({
  lockAt,
  minutes,
  variant = 'card',
}: {
  lockAt: number;
  minutes: number;
  variant?: 'card' | 'compact';
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  // `now` can be up to a second old, so right after activity the raw difference can exceed the
  // setting. Clamped so the countdown never reads more than the configured time.
  const remaining = Math.min(lockAt - now, minutes * 60_000);
  const fraction = Math.min(1, Math.max(0, remaining / (minutes * 60_000)));
  const low = remaining < 60_000;
  const card = variant === 'card';

  return (
    <button
      type="button"
      onClick={() => {
        lock();
      }}
      className={clsx(
        'group flex flex-col text-left transition-colors',
        card
          ? 'well w-full gap-2 p-3.5 hover:bg-[var(--sv-glass-strong)]'
          : 'min-w-32 gap-1 rounded-full px-3 py-1.5 hover:bg-[var(--sv-glass)]',
      )}
      aria-label={`Vault unlocked. Locks automatically in ${format(remaining)}. Lock now.`}
    >
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span
            aria-hidden="true"
            className={low ? 'size-2 rounded-full bg-warn' : 'size-2 rounded-full bg-success'}
          />
          <span className="group-hover:hidden">Unlocked</span>
          <span className="hidden items-center gap-1 group-hover:flex">
            <Lock size={14} aria-hidden="true" /> Lock now
          </span>
        </span>
        <span className="text-[0.8125rem] text-muted tabular-nums">{format(remaining)}</span>
      </span>
      <span
        aria-hidden="true"
        className="fuse"
        data-low={low}
        style={{ '--fuse': fraction } as CSSProperties}
      />
      {card ? (
        <span className="text-xs text-muted">
          Locks after {minutes} {minutes === 1 ? 'minute' : 'minutes'} of inactivity
        </span>
      ) : null}
    </button>
  );
}
