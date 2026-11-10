import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api/client';
import { onLock } from '../vault-session/session';

/**
 * Server data cache. It may hold ciphertext and account data, never decrypted vault contents:
 * those live only in the vault session.
 */
export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A 4xx will not succeed by asking again.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  });
  // Locking also drops cached vault data such as the wrapped key.
  onLock(() => {
    client.removeQueries({ queryKey: ['vault'] });
    client.removeQueries({ queryKey: ['activity'] });
  });
  return client;
}
