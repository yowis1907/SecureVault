import { clsx } from 'clsx';
import { Star } from 'lucide-react';
import { Link } from 'react-router';
import type { LoginEntry } from '../vault-session/model';

/** One dense, keyboard-reachable row: initial, title, and the account name. */
export function EntryRow({
  entry,
  selected = false,
  index = 0,
}: {
  entry: LoginEntry;
  selected?: boolean;
  /** Position in the list, for a short staggered entrance. Capped so long lists do not lag. */
  index?: number;
}) {
  const initial = (entry.title.trim()[0] ?? '?').toUpperCase();
  const subtitle = entry.username || entry.email;
  return (
    <li className="rise" style={{ ['--i' as string]: Math.min(index, 12) }}>
      <Link
        to={`/app/vault/${entry.id}`}
        aria-current={selected ? 'true' : undefined}
        className={clsx(
          'group flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5 transition-all duration-200',
          selected
            ? 'bg-surface shadow-[inset_2px_0_0_var(--sv-accent)]'
            : 'hover:translate-x-1 hover:bg-surface-2',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-line bg-bg font-mono text-sm transition-all duration-200 group-hover:border-accent/60 group-hover:text-accent group-hover:shadow-[0_0_16px_-6px_var(--sv-accent)]"
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
