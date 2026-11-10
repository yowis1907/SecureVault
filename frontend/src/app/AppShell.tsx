import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
  Wand2,
} from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { auth } from '../lib/api/endpoints';
import { useUnlockedVault } from '../vault-session/hooks';
import { lock, touch } from '../vault-session/session';
import { useCurrentUser } from '../lib/api/queries';
import { LockFuse } from './LockFuse';
import { Wordmark } from '../components/layout/Wordmark';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/vault', label: 'Vault', icon: KeyRound, end: false },
  { to: '/app/generator', label: 'Generator', icon: Wand2, end: false },
  { to: '/app/security', label: 'Security', icon: ShieldCheck, end: false },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
  { to: '/app/account', label: 'Account', icon: UserRound, end: false },
] as const;

export function AppShell() {
  const vault = useUnlockedVault();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Any keyboard or pointer activity pushes auto-lock back.
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
    };
  }, []);

  async function signOut() {
    lock();
    try {
      await auth.logout();
    } finally {
      queryClient.clear();
      void navigate('/login', { replace: true });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-[var(--radius-control)] bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Wordmark to="/app" />
          <div className="flex items-center gap-2">
            <LockFuse lockAt={vault.lockAt} minutes={vault.settings.autoLockMinutes} />
            <button
              type="button"
              onClick={() => void signOut()}
              className="hidden items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text sm:flex"
              title={me.data ? `Signed in as ${me.data.email}` : undefined}
            >
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 pb-24 md:pb-8">
        <nav aria-label="Main" className="sticky top-16 hidden h-fit w-48 shrink-0 py-6 md:block">
          <ul className="flex flex-col gap-0.5">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm',
                      isActive
                        ? 'bg-surface font-semibold text-text shadow-[inset_2px_0_0_var(--sv-accent)]'
                        : 'text-muted hover:bg-surface-2 hover:text-text',
                    )
                  }
                >
                  <Icon size={17} aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
            <li className="mt-4 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
              >
                <LogOut size={17} aria-hidden="true" /> Sign out
              </button>
            </li>
          </ul>
        </nav>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 py-6 outline-none">
          {vault.damaged > 0 ? (
            <p
              role="alert"
              className="mb-4 rounded-[var(--radius-control)] border-l-4 border-warn bg-warn-soft px-4 py-3 text-sm"
            >
              {vault.damaged === 1 ? '1 item' : `${String(vault.damaged)} items`} could not be
              decrypted and {vault.damaged === 1 ? 'is' : 'are'} hidden. The data may be damaged or
              may have been changed on the server.
            </p>
          ) : null}
          <Outlet />
        </main>
      </div>

      {/* Phone navigation: a bottom bar, since a side rail does not fit. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden"
      >
        <ul className="grid grid-cols-6">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center gap-0.5 py-2 text-[0.7rem]',
                    isActive ? 'text-accent' : 'text-muted',
                  )
                }
              >
                <Icon size={19} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
