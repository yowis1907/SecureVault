import { clsx } from 'clsx';
import { ChevronRight, Star } from 'lucide-react';
import { Link } from 'react-router';
import type { LoginEntry } from '../vault-session/model';

/** One keyboard-reachable row: an initial tile, the title, and the account name. */
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
          'group flex items-center gap-3.5 rounded-2xl px-3.5 py-3 transition-colors',
          selected
            ? 'bg-surface/90 shadow-[0_4px_14px_rgb(var(--sv-shadow)/0.07)]'
            : 'hover:bg-[var(--sv-glass)]',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'flex size-10 shrink-0 items-center justify-center rounded-[11px] text-[1.0625rem] font-semibold',
            selected ? 'bg-accent-fill text-on-accent' : 'bg-accent-soft text-accent',
          )}
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{entry.title || 'Untitled'}</span>
          {subtitle ? (
            <span className="block truncate text-[0.8125rem] text-muted">{subtitle}</span>
          ) : null}
        </span>
        {entry.favorite ? (
          <Star size={15} className="shrink-0 fill-current text-accent" aria-label="Favorite" />
        ) : null}
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}
