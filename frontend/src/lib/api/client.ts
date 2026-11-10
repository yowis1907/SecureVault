/**
 * The one way the app talks to the server.
 *
 * - Same origin only, with the session cookie that JavaScript cannot read (HttpOnly).
 * - The CSRF token lives in this module's memory, never in storage or a URL.
 * - Errors become ApiError with the `code` from the API specification.
 */

export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

let csrfToken: string | null = null;
const unauthenticatedListeners = new Set<() => void>();

/** Called when any request finds the session gone, so the app can lock and sign out locally. */
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

export async function refreshCsrfToken(): Promise<void> {
  const response = await fetch('/api/v1/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) {
    throw await toError(response);
  }
  const body = (await response.json()) as { token: string };
  csrfToken = body.token;
}

export function clearCsrfToken(): void {
  csrfToken = null;
}

async function toError(response: Response): Promise<ApiError> {
  let code = 'INTERNAL_ERROR';
  try {
    const problem = (await response.json()) as { code?: unknown };
    if (typeof problem.code === 'string') code = problem.code;
  } catch {
    // Not a problem document, for example a proxy error page.
  }
  const retry = Number(response.headers.get('Retry-After'));
  return new ApiError(
    response.status,
    code,
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrfToken) headers['X-XSRF-TOKEN'] = csrfToken;
    return fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  if (method !== 'GET' && !csrfToken) {
    await refreshCsrfToken();
  }
  let response = await send();

  // The token changes at login and logout. One refresh and retry covers a stale token; a second
  // rejection is a real failure.
  if (response.status === 403 && method !== 'GET') {
    const error = await toError(response.clone());
    if (error.code === 'CSRF_REJECTED') {
      await refreshCsrfToken();
      response = await send();
    }
  }

  if (!response.ok) {
    const error = await toError(response);
    if (error.status === 401 && error.code === 'UNAUTHENTICATED') {
      for (const listener of unauthenticatedListeners) listener();
    }
    throw error;
  }
  if (response.status === 204 || response.status === 202) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
