import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Notice, Spinner } from '../components/ui/Notice';
import { ApiError } from '../lib/api/client';
import { useCurrentUser } from '../lib/api/queries';
import { useVaultSession } from '../vault-session/hooks';

function FullPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

/** Requires a signed-in account session. */
export function RequireSession({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const location = useLocation();
  if (me.isPending) {
    return (
      <FullPage>
        <Spinner label="Checking your session" />
      </FullPage>
    );
  }
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    return (
      <FullPage>
        <Notice tone="danger" title="SecureVault could not reach the server">
          Check your connection, then reload the page.
        </Notice>
      </FullPage>
    );
  }
  return children;
}

/** Requires the vault to be unlocked in this tab. */
export function RequireUnlocked({ children }: { children: ReactNode }) {
  const session = useVaultSession();
  const location = useLocation();
  if (session.status !== 'unlocked') {
    return <Navigate to="/unlock" replace state={{ from: location.pathname }} />;
  }
  return children;
}
