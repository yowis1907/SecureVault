import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '../app/App';
import { createQueryClient } from '../app/query-client';
import { ToastRegion } from '../components/ui/Toast';
import { argon2idHashWasm } from '../crypto/argon2';
import { bytesToBase64 } from '../crypto/encoding';
import { createVaultKeys } from '../crypto/vault-keys';
import { fake } from './fake-server';

/** Renders the real routes at a path, with a fresh query cache. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = createQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastRegion />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}

/** Test credentials only, generated per test. */
export const credentials = () => ({
  email: `user-${crypto.randomUUID()}@example.test`,
  accountPassword: `account-${crypto.randomUUID()}`,
  masterPassword: `master ${crypto.randomUUID()} phrase`,
});

/** A verified, signed-in account whose vault uses real key material made with the real crypto. */
export async function signedInUser() {
  const c = credentials();
  const { material } = await createVaultKeys(
    c.masterPassword,
    crypto.randomUUID(),
    argon2idHashWasm,
  );
  const user = fake.addUser(c.email, c.accountPassword, {
    vaultId: material.vaultId,
    cryptoVersion: material.cryptoVersion,
    kdf: {
      algorithm: material.kdf.algorithm,
      memoryKib: material.kdf.memoryKib,
      iterations: material.kdf.iterations,
      parallelism: material.kdf.parallelism,
      salt: bytesToBase64(material.kdf.salt),
    },
    wrappedDek: bytesToBase64(material.wrappedDek),
    wrapNonce: bytesToBase64(material.wrapNonce),
  });
  fake.signedIn = user.id;
  return { ...c, user };
}

/** True when a value appears in any request body the app sent. */
export function sentToServer(value: string): boolean {
  return fake.requests.some((r) => r.body.includes(value));
}
