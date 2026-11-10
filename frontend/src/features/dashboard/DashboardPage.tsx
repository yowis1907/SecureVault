import { Plus, Star } from 'lucide-react';
import { Link } from 'react-router';
import { EntryRow } from '../../components/EntryRow';
import { useUnlockedVault } from '../../vault-session/hooks';

function Figure({
  value,
  label,
  to,
  state,
}: {
  value: string;
  label: string;
  to: string;
  state?: unknown;
}) {
  return (
    <Link to={to} state={state} className="group flex flex-col gap-1 py-1">
      <span className="font-mono text-2xl tabular-nums group-hover:text-accent">{value}</span>
      <span className="text-sm text-muted">{label}</span>
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
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight">Your vault is empty</h1>
        <p className="mt-2 text-muted">
          Add a login and it is encrypted on this device before it is saved.
        </p>
        <Link
          to="/app/vault/new"
          className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2.5 font-medium text-on-accent hover:bg-accent-strong"
        >
          <Plus size={18} aria-hidden="true" /> Add your first login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <Link
          to="/app/vault/new"
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong"
        >
          <Plus size={16} aria-hidden="true" /> Add login
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6 border-y border-line py-5 sm:grid-cols-4">
        <Figure value={String(vault.logins.length)} label="Logins" to="/app/vault" />
        <Figure value={String(vault.categories.length)} label="Categories" to="/app/vault" />
        <Figure
          value={String(vault.logins.filter((l) => l.favorite).length)}
          label="Favorites"
          to="/app/vault"
          state={{ filter: 'favorites' }}
        />
        <Figure value={String(reusedCount)} label="Reused passwords" to="/app/security" />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="favorites">
          <h2 id="favorites" className="flex items-center gap-2 font-semibold">
            <Star size={16} aria-hidden="true" className="text-accent" /> Favorites
          </h2>
          {favorites.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Star a login to keep it here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {favorites.map((l) => (
                <EntryRow key={l.id} entry={l} />
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="recent">
          <h2 id="recent" className="font-semibold">
            Recently changed
          </h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {recent.map((l) => (
              <EntryRow key={l.id} entry={l} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
