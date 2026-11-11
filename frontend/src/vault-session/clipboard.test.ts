import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedInUser } from '../test/helpers';
import { copyPlain, copySecret } from './clipboard';
import { lock, unlock } from './session';

describe('clipboard', () => {
  let written: string[];

  beforeEach(() => {
    written = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('overwrites a copied secret after the configured delay', async () => {
    vi.useFakeTimers();
    await copySecret('test-secret', 30);
    expect(written).toEqual(['test-secret']);

    await vi.advanceTimersByTimeAsync(29_000);
    expect(written).toEqual(['test-secret']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(written).toEqual(['test-secret', '']);
  });

  it('restarts the delay when another secret is copied', async () => {
    vi.useFakeTimers();
    await copySecret('first', 30);
    await vi.advanceTimersByTimeAsync(20_000);
    await copySecret('second', 30);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(written).toEqual(['first', 'second']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(written).toEqual(['first', 'second', '']);
  });

  it('clears a pending secret immediately when the vault locks', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    await copySecret('test-secret', 300);

    lock();

    await vi.waitFor(() => {
      expect(written).toEqual(['test-secret', '']);
    });
  });

  it('does not set a clear timer for plain values such as usernames', async () => {
    vi.useFakeTimers();
    await copyPlain('alice');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(written).toEqual(['alice']);
  });

  it('does not fail when the browser refuses to clear', async () => {
    vi.useFakeTimers();
    let calls = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => (++calls === 1 ? Promise.resolve() : Promise.reject(new Error('denied'))),
      },
    });
    await copySecret('test-secret', 10);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(2);
  });
});
