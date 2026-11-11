import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnlockError } from '../crypto/errors';
import { fake } from '../test/fake-server';
import { sentToServer, signedInUser } from '../test/helpers';
import { emptyLogin } from './model';
import {
  deleteCategory,
  deleteLogin,
  getSnapshot,
  lock,
  lockIfExpired,
  saveCategory,
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

describe('vault session: categories, settings, and edits', () => {
  it('saves, edits, and deletes entries and categories, surviving a lock', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    const category = await saveCategory({ schema: 1, name: canary('category') });
    const created = await saveLogin({ ...emptyLogin(), title: 'B', categoryId: category.id });
    const other = await saveLogin({ ...emptyLogin(), title: 'a' });
    const edited = await saveLogin({ ...emptyLogin(), title: 'B', password: 'new-pw' }, created);
    expect(edited.version).toBe(2);
    await saveSettings({ schema: 1, autoLockMinutes: 9, clipboardClearSeconds: 60 });
    await deleteLogin(other.id);

    lock();
    await unlock(account.masterPassword);
    let snapshot = getSnapshot();
    if (snapshot.status !== 'unlocked') throw new Error('expected unlocked');
    expect(snapshot.logins.map((l) => [l.title, l.password, l.version])).toEqual([
      ['B', 'new-pw', 2],
    ]);
    expect(snapshot.categories.map((c) => c.name)).toEqual([category.name]);
    expect(snapshot.settings.autoLockMinutes).toBe(9);
    expect(sentToServer(category.name)).toBe(false);

    await deleteCategory(category.id);
    snapshot = getSnapshot();
    expect(snapshot.status === 'unlocked' && snapshot.categories).toEqual([]);
  });

  it('falls back to safe defaults when stored settings were tampered with', async () => {
    const account = await signedInUser();
    account.user.vault.settings = {
      nonce: btoa('n'.repeat(12)),
      ciphertext: btoa('c'.repeat(272)),
    };
    await unlock(account.masterPassword);
    const snapshot = getSnapshot();
    if (snapshot.status !== 'unlocked') throw new Error('expected unlocked');
    expect(snapshot.settings.autoLockMinutes).toBe(5);
    expect(snapshot.damaged).toBe(1);
  });

  it('rejects a stale edit instead of overwriting newer data', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    const created = await saveLogin({ ...emptyLogin(), title: 'x' });
    await saveLogin({ ...emptyLogin(), title: 'y' }, created);
    await expect(saveLogin({ ...emptyLogin(), title: 'z' }, created)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
  });
});
