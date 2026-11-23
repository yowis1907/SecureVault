import { clsx } from 'clsx';
import { ArrowLeft, FolderPlus, Plus, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { EntryRow } from '../../components/EntryRow';
import { useUnlockedVault } from '../../vault-session/hooks';
import type { LoginEntry } from '../../vault-session/model';
import { CategoriesDialog } from './CategoriesDialog';
import { EntryDetail } from './EntryDetail';

type Filter = { kind: 'all' } | { kind: 'favorites' } | { kind: 'category'; id: string | null };

function matches(entry: LoginEntry, query: string): boolean {
  if (!query) return true;
  const q = query.toLocaleLowerCase();
  return [entry.title, entry.username, entry.email, entry.notes, ...entry.urls, ...entry.tags].some(
    (field) => field.toLocaleLowerCase().includes(q),
  );
}

export function VaultPage() {
  const vault = useUnlockedVault();
  const { id } = useParams();
  const location = useLocation();
  const initialFilter = (location.state as { filter?: string } | null)?.filter;
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>(
    initialFilter === 'favorites' ? { kind: 'favorites' } : { kind: 'all' },
  );
  const [managing, setManaging] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search, as in many tools, unless the user is already typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.key === '/' && target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const visible = useMemo(
    () =>
      vault.logins.filter((entry) => {
        if (filter.kind === 'favorites' && !entry.favorite) return false;
        if (filter.kind === 'category') {
          const known = vault.categories.some((c) => c.id === entry.categoryId);
          if (filter.id === null ? known : entry.categoryId !== filter.id) return false;
        }
        return matches(entry, deferredQuery.trim());
      }),
    [vault.logins, vault.categories, filter, deferredQuery],
  );

  const selected = id ? vault.logins.find((l) => l.id === id) : undefined;
  const filterValue = filter.kind === 'category' ? `category:${filter.id ?? 'none'}` : filter.kind;

  return (
    <div className="flex flex-col gap-5">
      <div
        className={clsx(
          'flex flex-wrap items-end justify-between gap-3',
          selected && 'hidden lg:flex',
        )}
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vault</h1>
          <p className="text-sm text-muted">
            {vault.logins.length === 1 ? '1 login' : `${String(vault.logins.length)} logins`},
            searched on this device only
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setManaging(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 text-sm hover:bg-surface-2"
          >
            <FolderPlus size={16} aria-hidden="true" /> Categories
          </button>
          <Link
            to="/app/vault/new"
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-strong"
          >
            <Plus size={16} aria-hidden="true" /> Add login
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <section
          aria-label="Logins"
          className={clsx('flex flex-col gap-3', selected && 'hidden lg:flex')}
        >
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <label className="relative flex-1">
              <span className="sr-only">Search logins</span>
              <Search
                size={16}
                aria-hidden="true"
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                placeholder="Search  ( / )"
                autoComplete="off"
                className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface pr-3 pl-9"
              />
            </label>
            <label className="sm:w-48 lg:w-full">
              <span className="sr-only">Show</span>
              <select
                value={filterValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'all' || v === 'favorites') setFilter({ kind: v });
                  else {
                    const cat = v.slice('category:'.length);
                    setFilter({ kind: 'category', id: cat === 'none' ? null : cat });
                  }
                }}
                className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3"
              >
                <option value="all">All logins</option>
                <option value="favorites">Favorites</option>
                {vault.categories.map((c) => (
                  <option key={c.id} value={`category:${c.id}`}>
                    {c.name}
                  </option>
                ))}
                <option value="category:none">No category</option>
              </select>
            </label>
          </div>
          {visible.length === 0 ? (
            <p className="py-6 text-sm text-muted">
              {vault.logins.length === 0
                ? 'No logins yet. Add one to get started.'
                : 'Nothing matches.'}
            </p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {visible.map((entry, i) => (
                <EntryRow key={entry.id} entry={entry} selected={entry.id === id} index={i} />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Login details" className={clsx(!selected && 'hidden lg:block')}>
          {selected ? (
            <>
              <Link
                to="/app/vault"
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text lg:hidden"
              >
                <ArrowLeft size={16} aria-hidden="true" /> All logins
              </Link>
              <EntryDetail entry={selected} />
            </>
          ) : id ? (
            <p className="text-muted">
              This login no longer exists. It may have been deleted in another tab.
            </p>
          ) : (
            <p className="hidden pt-2 text-muted lg:block">Select a login to see its details.</p>
          )}
        </section>
      </div>
      <CategoriesDialog
        open={managing}
        onClose={() => {
          setManaging(false);
        }}
      />
    </div>
  );
}
