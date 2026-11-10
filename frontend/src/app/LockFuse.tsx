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
 * The signature element: a fuse that burns down toward auto-lock, so the vault's state is always
 * visible. Any activity resets it. Clicking locks immediately.
 */
export function LockFuse({ lockAt, minutes }: { lockAt: number; minutes: number }) {
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

  return (
    <button
      type="button"
      onClick={() => {
        lock();
      }}
      className="group flex min-w-36 flex-col gap-1 rounded-[var(--radius-control)] px-2 py-1 text-left hover:bg-surface-2"
      aria-label={`Vault unlocked. Locks automatically in ${format(remaining)}. Lock now.`}
    >
      <span className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={low ? 'size-2 rounded-full bg-warn' : 'size-2 rounded-full bg-accent'}
          />
          <span className="group-hover:hidden">Unlocked</span>
          <span className="hidden items-center gap-1 group-hover:flex">
            <Lock size={14} aria-hidden="true" /> Lock now
          </span>
        </span>
        <span className="font-mono tabular-nums text-muted">{format(remaining)}</span>
      </span>
      <span
        aria-hidden="true"
        className="fuse"
        data-low={low}
        style={{ '--fuse': fraction } as CSSProperties}
      />
    </button>
  );
}
