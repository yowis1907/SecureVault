import { KeyRound, Plus, Star } from 'lucide-react';
import { Link } from 'react-router';
import { EntryRow } from '../../components/EntryRow';
import { useCountUp } from '../../lib/motion';
import { useUnlockedVault } from '../../vault-session/hooks';

const addClass =
  'inline-flex h-11 items-center gap-2 rounded-full bg-accent-fill px-5 text-[0.9375rem] font-medium text-on-accent ' +
  'shadow-[0_6px_18px_-6px_color-mix(in_oklab,var(--sv-accent-fill)_60%,transparent)] transition hover:brightness-110';

function Figure({
  value,
  label,
  to,
  state,
}: {
  value: number;
  label: string;
  to: string;
  state?: unknown;
}) {
  const shown = useCountUp(value);
  return (
    <Link
      to={to}
      state={state}
      className="glass group flex flex-col gap-1 p-6 transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span className="text-[2.5rem] leading-none font-semibold tracking-tight tabular-nums transition-colors group-hover:text-accent">
        <span className="sr-only">{value}</span>
        <span aria-hidden="true">{shown}</span>
      </span>
      <span className="mt-1 text-[0.9375rem] text-muted">{label}</span>
    </Link>
  );
}

export function DashboardPage() {
  const vault = useUnlockedVault();
  const counts = new Map<string, number>();
  for (const l of vault.logins) {
    if (l.password) counts.set(l.password, (counts.get(l.password) ?? 0) + 1);
  }
  const reusedCount = vault.logins.filter((l) => (counts.get(l.password) ?? 0) > 1).length;
  const favorites = vault.logins.filter((l) => l.favorite).slice(0, 8);
  const recent = [...vault.logins]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  if (vault.logins.length === 0) {
    return (
      <div className="glass flex max-w-2xl flex-col items-start p-10">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound size={26} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-[2.5rem] leading-tight font-semibold">Your vault is empty</h1>
        <p className="mt-2 text-[1.0625rem] text-muted">
          Add a login and it is encrypted on this device before it is saved.
        </p>
        <Link to="/app/vault/new" className={`${addClass} mt-8`}>
          <Plus size={18} aria-hidden="true" /> Add your first login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[2.5rem] leading-tight font-semibold">Overview</h1>
        <Link to="/app/vault/new" className={addClass}>
          <Plus size={18} aria-hidden="true" /> Add login
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Figure value={vault.logins.length} label="Logins" to="/app/vault" />
        <Figure value={vault.categories.length} label="Categories" to="/app/vault" />
        <Figure
          value={vault.logins.filter((l) => l.favorite).length}
          label="Favorites"
          to="/app/vault"
          state={{ filter: 'favorites' }}
        />
        <Figure value={reusedCount} label="Reused passwords" to="/app/security" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="favorites" className="glass p-3">
          <h2
            id="favorites"
            className="flex items-center gap-2 px-3 pt-2 pb-2 text-[1.0625rem] font-semibold"
          >
            <Star size={16} aria-hidden="true" className="text-accent" /> Favorites
          </h2>
          {favorites.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-muted">Star a login to keep it here.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {favorites.map((l, i) => (
                <EntryRow key={l.id} entry={l} index={i} />
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="recent" className="glass p-3">
          <h2 id="recent" className="px-3 pt-2 pb-2 text-[1.0625rem] font-semibold">
            Recently changed
          </h2>
          <ul className="flex flex-col gap-0.5">
            {recent.map((l, i) => (
              <EntryRow key={l.id} entry={l} index={i} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
