import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnlockError } from '../crypto/errors';
import { fake } from '../test/fake-server';
import { sentToServer, signedInUser } from '../test/helpers';
import { emptyLogin } from './model';
import {
  getSnapshot,
  lock,
  lockIfExpired,
  saveLogin,
  saveSettings,
  touch,
  unlock,
} from './session';

const canary = (label: string) => `canary-${label}-${crypto.randomUUID()}`;

describe('vault session', () => {
  it('unlocks, keeps decrypted entries only in memory, and locks again', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    const saved = await saveLogin({ ...emptyLogin(), title: 'Example', password: 'pw-1' });

    lock();
    expect(getSnapshot()).toEqual({ status: 'locked' });
    await expect(saveLogin({ ...emptyLogin(), title: 'After lock' })).rejects.toThrow(/locked/);

    await unlock(account.masterPassword);
    const snapshot = getSnapshot();
    expect(snapshot.status).toBe('unlocked');
    if (snapshot.status === 'unlocked') {
      expect(snapshot.logins.map((l) => l.id)).toEqual([saved.id]);
      expect(snapshot.logins[0]?.password).toBe('pw-1');
    }
  });

  it('rejects a wrong master password and stays locked', async () => {
    await signedInUser();
    await expect(unlock('not the master password')).rejects.toThrow(UnlockError);
    expect(getSnapshot().status).toBe('locked');
  });

  it('never sends the master password or any entry field to the server', async () => {
    const account = await signedInUser();
    const secrets = {
      title: canary('title'),
      username: canary('username'),
      email: canary('email'),
      password: canary('password'),
      urls: [`https://${canary('url')}.example`],
      notes: canary('notes'),
      tags: [canary('tag')],
    };
    await unlock(account.masterPassword);
    await saveLogin({ ...emptyLogin(), ...secrets });
    await saveSettings({ schema: 1, autoLockMinutes: 7, clipboardClearSeconds: 45 });

    expect(fake.requests.length).toBeGreaterThan(0);
    expect(sentToServer(account.masterPassword)).toBe(false);
    for (const value of [
      secrets.title,
      secrets.username,
      secrets.email,
      secrets.password,
      secrets.notes,
      secrets.urls[0] ?? '',
      secrets.tags[0] ?? '',
    ]) {
      expect(sentToServer(value)).toBe(false);
    }
    const stored = [...account.user.records.values()];
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(secrets.title);
  });

  it('locks after the configured inactivity, and activity pushes that back', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    const first = getSnapshot();
    if (first.status !== 'unlocked') throw new Error('expected unlocked');

    lockIfExpired(first.lockAt - 1);
    expect(getSnapshot().status).toBe('unlocked');

    await new Promise((r) => setTimeout(r, 1100));
    touch();
    const touched = getSnapshot();
    expect(touched.status === 'unlocked' && touched.lockAt > first.lockAt).toBe(true);

    lockIfExpired(first.lockAt + 5 * 60_000 + 2_000);
    expect(getSnapshot().status).toBe('locked');
  });

  it('locks when another tab locks', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    const otherTab = new BroadcastChannel('securevault-lock');
    otherTab.postMessage('lock');
    await waitFor(() => {
      expect(getSnapshot().status).toBe('locked');
    });
    otherTab.close();
  });

  it('locks when the server says the session has ended', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    fake.signedIn = null;
    await expect(saveLogin({ ...emptyLogin(), title: 'x' })).rejects.toThrow();
    expect(getSnapshot().status).toBe('locked');
  });

  it('reports records that fail to decrypt instead of dropping them silently', async () => {
    const account = await signedInUser();
    const id = crypto.randomUUID();
    account.user.records.set(id, {
      id,
      type: 'LOGIN',
      cryptoVersion: 1,
      nonce: btoa('x'.repeat(12)),
      ciphertext: btoa('y'.repeat(272)),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await unlock(account.masterPassword);
    const snapshot = getSnapshot();
    expect(snapshot.status === 'unlocked' && snapshot.damaged).toBe(1);
  });
});
