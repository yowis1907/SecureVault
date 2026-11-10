import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test/fake-server';
import { ApiError, clearCsrfToken, onUnauthenticated, request } from './client';

describe('API client', () => {
  it('fetches a CSRF token before the first state-changing request and sends it', async () => {
    clearCsrfToken();
    let seen: string | null = null;
    server.use(
      http.post('/api/v1/echo', ({ request: r }) => {
        seen = r.headers.get('X-XSRF-TOKEN');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await request('POST', '/echo', {});
    expect(seen).toBe('csrf-test-token');
  });

  it('refreshes a rejected CSRF token once and retries', async () => {
    let calls = 0;
    server.use(
      http.post('/api/v1/flaky', () => {
        calls++;
        return calls === 1
          ? HttpResponse.json({ code: 'CSRF_REJECTED' }, { status: 403 })
          : HttpResponse.json({ ok: true });
      }),
    );
    await expect(request('POST', '/flaky', {})).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('turns problem responses into ApiError with the code and Retry-After', async () => {
    server.use(
      http.get('/api/v1/limited', () =>
        HttpResponse.json(
          { code: 'RATE_LIMITED' },
          { status: 429, headers: { 'Retry-After': '42' } },
        ),
      ),
    );
    const error = await request('GET', '/limited').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 42 });
  });

  it('tells listeners when the session has ended', async () => {
    const listener = vi.fn();
    const stop = onUnauthenticated(listener);
    await expect(request('GET', '/auth/me')).rejects.toThrow(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });
});
