import { describe, expect, it } from 'vitest';
import { BackupOpenError } from '../crypto/errors';
import { fake } from '../test/fake-server';
import { sentToServer, signedInUser } from '../test/helpers';
import { emptyLogin } from './model';
import {
  exportBackup,
  getSnapshot,
  importBackup,
  lock,
  saveCategory,
  saveLogin,
  unlock,
} from './session';

const canary = (label: string) => `canary-${label}-${crypto.randomUUID()}`;
const passphrase = 'test backup passphrase for the vault';

function snapshot() {
  const s = getSnapshot();
  if (s.status !== 'unlocked') throw new Error('expected unlocked');
  return s;
}

describe('vault backup', () => {
  it('exports from one vault and imports into another with new IDs', async () => {
    const source = await signedInUser();
    await unlock(source.masterPassword);
    const secret = { title: canary('title'), password: canary('password'), notes: canary('notes') };
    const work = await saveCategory({ schema: 1, name: 'Work' });
    const original = await saveLogin({
      ...emptyLogin(),
      ...secret,
      categoryId: work.id,
      tags: ['t'],
    });
    const fileText = await exportBackup(passphrase);
    expect(fileText).not.toContain(secret.password);
    lock();

    const target = await signedInUser();
    await unlock(target.masterPassword);
    await saveCategory({ schema: 1, name: 'work' });
    fake.requests = [];

    const result = await importBackup(fileText, passphrase);

    // The existing "work" category is reused rather than duplicated.
    expect(result).toEqual({ logins: 1, categories: 0 });
    const vault = snapshot();
    expect(vault.categories.map((c) => c.name)).toEqual(['work']);
    const imported = vault.logins[0];
    expect(imported?.title).toBe(secret.title);
    expect(imported?.password).toBe(secret.password);
    expect(imported?.categoryId).toBe(vault.categories[0]?.id);
    expect(imported?.id).not.toBe(original.id);

    // Uploaded as ciphertext through the batch endpoint, with nothing readable.
    expect(fake.requests.some((r) => r.path === '/api/v1/vault/records/batch')).toBe(true);
    for (const value of [...Object.values(secret), passphrase, fileText.slice(0, 40)]) {
      expect(sentToServer(value)).toBe(false);
    }

    // It survives a lock, so it was stored under this vault's key.
    lock();
    await unlock(target.masterPassword);
    expect(snapshot().logins.map((l) => l.title)).toEqual([secret.title]);
  });

  it('refuses a wrong passphrase and imports nothing', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    await saveLogin({ ...emptyLogin(), title: 'x' });
    const fileText = await exportBackup(passphrase);
    const before = account.user.records.size;

    await expect(importBackup(fileText, 'wrong passphrase')).rejects.toThrow(BackupOpenError);
    expect(account.user.records.size).toBe(before);
  });

  it('checks the 5,000-item limit before uploading anything', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    await saveLogin({ ...emptyLogin(), title: 'one' });
    await saveLogin({ ...emptyLogin(), title: 'two' });
    const fileText = await exportBackup(passphrase);
    // Fill the vault to the limit with stand-in records.
    for (let i = account.user.records.size; i < 4999; i++) {
      const id = crypto.randomUUID();
      account.user.records.set(id, {
        id,
        type: 'LOGIN',
        cryptoVersion: 1,
        nonce: '',
        ciphertext: '',
        version: 1,
        createdAt: '',
        updatedAt: '',
      });
    }
    lock();
    await unlock(account.masterPassword);
    // The stand-ins do not decrypt, so they show up as damaged. They still use up the limit.
    expect(snapshot().damaged).toBe(4997);
    const before = account.user.records.size;
    fake.requests = [];

    await expect(importBackup(fileText, passphrase)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    // Refused on the device, before any upload.
    expect(fake.requests.some((r) => r.path === '/api/v1/vault/records/batch')).toBe(false);
    expect(account.user.records.size).toBe(before);
  }, 60_000);

  it('splits a large import into several batches', async () => {
    const account = await signedInUser();
    await unlock(account.masterPassword);
    for (let i = 0; i < 150; i++) {
      await saveLogin({ ...emptyLogin(), title: `entry ${String(i).padStart(3, '0')}` });
    }
    const fileText = await exportBackup(passphrase);
    lock();
    const target = await signedInUser();
    await unlock(target.masterPassword);
    fake.requests = [];

    expect(await importBackup(fileText, passphrase)).toEqual({ logins: 150, categories: 0 });
    expect(fake.requests.filter((r) => r.path === '/api/v1/vault/records/batch')).toHaveLength(2);
    expect(snapshot().logins).toHaveLength(150);
  }, 60_000);
});
