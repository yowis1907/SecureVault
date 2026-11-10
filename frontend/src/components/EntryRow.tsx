import { clsx } from 'clsx';
import { Star } from 'lucide-react';
import { Link } from 'react-router';
import type { LoginEntry } from '../vault-session/model';

/** One dense, keyboard-reachable row: initial, title, and the account name. */
export function EntryRow({ entry, selected = false }: { entry: LoginEntry; selected?: boolean }) {
  const initial = (entry.title.trim()[0] ?? '?').toUpperCase();
  const subtitle = entry.username || entry.email;
  return (
    <li>
      <Link
        to={`/app/vault/${entry.id}`}
        aria-current={selected ? 'true' : undefined}
        className={clsx(
          'flex items-center gap-3 px-2 py-2.5',
          selected ? 'bg-surface shadow-[inset_2px_0_0_var(--sv-accent)]' : 'hover:bg-surface-2',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-line bg-bg font-mono text-sm"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{entry.title || 'Untitled'}</span>
          {subtitle ? <span className="block truncate text-sm text-muted">{subtitle}</span> : null}
        </span>
        {entry.favorite ? (
          <Star size={15} className="shrink-0 fill-current text-accent" aria-label="Favorite" />
        ) : null}
      </Link>
    </li>
  );
}
