import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
  WandSparkles,
} from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Wordmark } from '../components/layout/Wordmark';
import { auth } from '../lib/api/endpoints';
import { useCurrentUser } from '../lib/api/queries';
import { useMediaQuery } from '../lib/motion';
import { useUnlockedVault } from '../vault-session/hooks';
import { lock, touch } from '../vault-session/session';
import { LockFuse } from './LockFuse';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/vault', label: 'Vault', icon: KeyRound, end: false },
  { to: '/app/generator', label: 'Generator', icon: WandSparkles, end: false },
  { to: '/app/security', label: 'Security', icon: ShieldCheck, end: false },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
  { to: '/app/account', label: 'Account', icon: UserRound, end: false },
] as const;

/**
 * The unlocked app: a floating liquid glass sidebar on wide screens, and on phones a glass
 * header with the lock fuse plus a floating glass tab bar at the bottom.
 */
export function AppShell() {
  const vault = useUnlockedVault();
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // One lock fuse at a time: in the sidebar on wide screens, in the header on phones.
  const wide = useMediaQuery('(min-width: 768px)');

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
    <div className="min-h-dvh md:flex md:gap-5 md:p-5">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-surface px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Sidebar, from md up. */}
      <aside className="glass sticky top-5 hidden h-[calc(100dvh-2.5rem)] w-[248px] flex-none flex-col p-3.5 md:flex">
        <div className="px-2.5 pt-1.5 pb-6">
          <Wordmark to="/app" />
        </div>
        <nav aria-label="Main" className="flex-1">
          <ul className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9375rem] transition-colors',
                      isActive
                        ? 'bg-surface/85 font-medium text-text shadow-[0_2px_8px_rgb(var(--sv-shadow)/0.06)]'
                        : 'text-muted hover:bg-[var(--sv-glass)] hover:text-text',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        size={20}
                        strokeWidth={1.75}
                        aria-hidden="true"
                        className={isActive ? 'text-accent' : undefined}
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {wide ? <LockFuse lockAt={vault.lockAt} minutes={vault.settings.autoLockMinutes} /> : null}
        <button
          type="button"
          onClick={() => void signOut()}
          title={me.data ? `Signed in as ${me.data.email}` : undefined}
          className="mt-1 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9375rem] text-muted transition-colors hover:bg-[var(--sv-glass)] hover:text-text"
        >
          <LogOut size={20} strokeWidth={1.75} aria-hidden="true" /> Sign out
        </button>
      </aside>

      {/* Phone header. */}
      {wide ? null : (
        <header className="glass-bar sticky top-0 z-30 flex h-14 items-center justify-between rounded-none border-x-0 border-t-0 px-4 md:hidden">
          <Wordmark to="/app" />
          <div className="flex items-center gap-1">
            <LockFuse
              lockAt={vault.lockAt}
              minutes={vault.settings.autoLockMinutes}
              variant="compact"
            />
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="rounded-full p-2 text-muted hover:bg-[var(--sv-glass)] hover:text-text"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
      )}

      <main
        id="main"
        tabIndex={-1}
        className="rise min-w-0 flex-1 px-4 pt-6 pb-32 outline-none md:px-3 md:pt-3 md:pb-6"
      >
        {vault.damaged > 0 ? (
          <p role="alert" className="mb-4 rounded-2xl bg-warn-soft px-4 py-3 text-sm">
            {vault.damaged === 1 ? '1 item' : `${String(vault.damaged)} items`} could not be
            decrypted and {vault.damaged === 1 ? 'is' : 'are'} hidden. The data may be damaged or
            may have been changed on the server.
          </p>
        ) : null}
        <Outlet />
      </main>

      {/* Phone navigation: a floating liquid glass tab bar. */}
      <nav
        aria-label="Main"
        className="glass-bar fixed inset-x-3 bottom-5 z-30 rounded-full p-1.5 md:hidden"
      >
        <ul className="grid grid-cols-6">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[0.6875rem] font-medium transition-colors',
                    isActive ? 'bg-surface/85 text-accent' : 'text-muted',
                  )
                }
              >
                <Icon size={21} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
