/**
 * An in-memory server that follows docs/API_SPECIFICATION.md closely enough for component tests.
 * Like the real one, it stores ciphertext without being able to read it. Every request body is
 * recorded so tests can check that no secret ever leaves the browser.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

interface Vault {
  vaultId: string;
  cryptoVersion: number;
  kdf: Record<string, unknown>;
  wrappedDek: string;
  wrapNonce: string;
  keyVersion: number;
  settings: { nonce: string; ciphertext: string } | null;
}

interface StoredRecord {
  id: string;
  type: string;
  cryptoVersion: number;
  nonce: string;
  ciphertext: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  accountPassword: string;
  verified: boolean;
  vault: Vault;
  records: Map<string, StoredRecord>;
}

const CSRF = 'csrf-test-token';

export const fake = {
  users: new Map<string, User>(),
  signedIn: null as string | null,
  verificationTokens: new Map<string, string>(),
  /** Every request: method, path, and raw body. */
  requests: [] as { method: string; path: string; body: string }[],
  reset() {
    this.users.clear();
    this.signedIn = null;
    this.verificationTokens.clear();
    this.requests = [];
  },
  /** Adds a verified account directly, for tests that start after sign-up. */
  addUser(email: string, accountPassword: string, vault: Omit<Vault, 'keyVersion' | 'settings'>) {
    const user: User = {
      id: crypto.randomUUID(),
      email,
      accountPassword,
      verified: true,
      vault: { ...vault, keyVersion: 1, settings: null },
      records: new Map(),
    };
    this.users.set(email, user);
    return user;
  },
  current(): User | undefined {
    return [...this.users.values()].find((u) => u.id === this.signedIn);
  },
};

const problem = (status: number, code: string) =>
  HttpResponse.json({ type: 'about:blank', title: code, status, code, traceId: '0' }, { status });

function requireUser(): User | Response {
  const user = fake.current();
  return user ?? problem(401, 'UNAUTHENTICATED');
}

const now = () => new Date().toISOString();

export const handlers = [
  http.all('/api/v1/*', async ({ request }) => {
    fake.requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: request.method === 'GET' ? '' : await request.clone().text(),
    });
    if (request.method !== 'GET' && request.headers.get('X-XSRF-TOKEN') !== CSRF) {
      return problem(403, 'CSRF_REJECTED');
    }
    return undefined;
  }),

  http.get('/api/v1/auth/csrf', () =>
    HttpResponse.json({ headerName: 'X-XSRF-TOKEN', token: CSRF }),
  ),

  http.post('/api/v1/auth/register', async ({ request }) => {
    const body = (await request.json()) as { email: string; accountPassword: string; vault: Vault };
    if (!fake.users.has(body.email)) {
      const user = fake.addUser(body.email, body.accountPassword, body.vault);
      user.verified = false;
      fake.verificationTokens.set(`token-for-${user.id}`.padEnd(43, 'x'), body.email);
    }
    return new HttpResponse(null, { status: 202 });
  }),

  http.post('/api/v1/auth/verify-email', async ({ request }) => {
    const { token } = (await request.json()) as { token: string };
    const email = fake.verificationTokens.get(token);
    const user = email ? fake.users.get(email) : undefined;
    if (!user) return problem(400, 'INVALID_TOKEN');
    fake.verificationTokens.delete(token);
    user.verified = true;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const { email, accountPassword } = (await request.json()) as Record<string, string>;
    const user = fake.users.get(email ?? '');
    if (!user || user.accountPassword !== accountPassword)
      return problem(401, 'INVALID_CREDENTIALS');
    if (!user.verified) return problem(403, 'EMAIL_NOT_VERIFIED');
    fake.signedIn = user.id;
    return HttpResponse.json({ id: user.id, email: user.email, createdAt: now() });
  }),

  http.post('/api/v1/auth/logout', () => {
    fake.signedIn = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/v1/auth/me', () => {
    const user = requireUser();
    if (user instanceof Response) return user;
    return HttpResponse.json({ id: user.id, email: user.email, createdAt: now() });
  }),

  http.get('/api/v1/vault', () => {
    const user = requireUser();
    if (user instanceof Response) return user;
    return HttpResponse.json(user.vault);
  }),

  http.put('/api/v1/vault/settings', async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    user.vault.settings = (await request.json()) as Vault['settings'];
    return new HttpResponse(null, { status: 204 });
  }),

  http.put('/api/v1/vault/key-material', async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const body = (await request.json()) as Record<string, unknown>;
    if (body.accountPassword !== user.accountPassword) return problem(403, 'STEP_UP_FAILED');
    if (body.expectedKeyVersion !== user.vault.keyVersion) return problem(409, 'VERSION_CONFLICT');
    user.vault = {
      ...user.vault,
      kdf: body.kdf as Record<string, unknown>,
      wrappedDek: body.wrappedDek as string,
      wrapNonce: body.wrapNonce as string,
      keyVersion: user.vault.keyVersion + 1,
    };
    return HttpResponse.json({ keyVersion: user.vault.keyVersion });
  }),

  http.get('/api/v1/vault/records', () => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const records = [...user.records.values()].sort((a, b) => a.id.localeCompare(b.id));
    return HttpResponse.json({ records, nextCursor: null });
  }),

  http.post('/api/v1/vault/records', async ({ request }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const body = (await request.json()) as Omit<
      StoredRecord,
      'version' | 'createdAt' | 'updatedAt'
    >;
    if (user.records.has(body.id)) return problem(409, 'RECORD_ID_CONFLICT');
    const record = { ...body, version: 1, createdAt: now(), updatedAt: now() };
    user.records.set(body.id, record);
    return HttpResponse.json(record, { status: 201 });
  }),

  http.put('/api/v1/vault/records/:id', async ({ request, params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    const existing = user.records.get(params.id as string);
    if (!existing) return problem(404, 'NOT_FOUND');
    const body = (await request.json()) as { version: number; nonce: string; ciphertext: string };
    if (body.version !== existing.version) return problem(409, 'VERSION_CONFLICT');
    const record = {
      ...existing,
      nonce: body.nonce,
      ciphertext: body.ciphertext,
      version: existing.version + 1,
      updatedAt: now(),
    };
    user.records.set(existing.id, record);
    return HttpResponse.json(record);
  }),

  http.delete('/api/v1/vault/records/:id', ({ params }) => {
    const user = requireUser();
    if (user instanceof Response) return user;
    if (!user.records.delete(params.id as string)) return problem(404, 'NOT_FOUND');
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/v1/activity', () => HttpResponse.json({ events: [] })),
];

export const server = setupServer(...handlers);
