/**
 * The vault session: the only place decrypted data and the data encryption key (DEK) exist.
 *
 * - The DEK is a non-extractable CryptoKey in this module's scope. It never enters React state,
 *   context, props, TanStack Query, or any browser storage.
 * - Decrypted entries live in an immutable snapshot read through useSyncExternalStore.
 * - Locking drops the key reference and the snapshot. JavaScript cannot guarantee that memory is
 *   wiped, so this reduces exposure rather than eliminating it.
 */
import type { Argon2idFunction } from '../crypto/argon2';
import { createBackup, openBackup } from '../crypto/backup';
import { CryptoFormatError } from '../crypto/errors';
import {
  decryptRecord,
  decryptSettings,
  encryptRecord,
  encryptSettings,
  type EncryptedBlob,
} from '../crypto/records';
import { unlockVault } from '../crypto/vault-keys';
import { ApiError, onUnauthenticated } from '../lib/api/client';
import { records as recordsApi, vault as vaultApi, type StoredRecord } from '../lib/api/endpoints';
import { createWorkerArgon2 } from '../workers/argon2-client';
import {
  backupContentsSchema,
  categoryDataSchema,
  DEFAULT_SETTINGS,
  loginDataSchema,
  settingsSchema,
  type BackupContents,
  type Category,
  type CategoryData,
  type LoginData,
  type LoginEntry,
  type VaultSettings,
} from './model';

export interface UnlockedState {
  status: 'unlocked';
  vaultId: string;
  keyVersion: number;
  logins: LoginEntry[];
  categories: Category[];
  settings: VaultSettings;
  /** Records that failed to decrypt or validate. Shown as a count, never silently dropped. */
  damaged: number;
  lockAt: number;
}

export type SessionState = { status: 'locked' } | UnlockedState;

const LOCKED: SessionState = { status: 'locked' };
const CHANNEL = 'securevault-lock';

let state: SessionState = LOCKED;
let dek: CryptoKey | null = null;
let argon2: Argon2idFunction | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTouch = 0;
const listeners = new Set<() => void>();
const lockListeners = new Set<() => void>();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);

channel?.addEventListener('message', (event: MessageEvent) => {
  // Another tab locked or signed out. The message carries no key material.
  if (event.data === 'lock') lock({ broadcast: false });
});
onUnauthenticated(() => {
  lock();
});

function set(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
}

function unlocked(): UnlockedState {
  if (state.status !== 'unlocked' || !dek) {
    throw new Error('The vault is locked.');
  }
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): SessionState {
  return state;
}

/** Tests use hash-wasm directly; the app uses a Web Worker so the UI stays responsive. */
export function configureArgon2(fn: Argon2idFunction): void {
  argon2 = fn;
}

/** The Argon2id implementation in use, created on first need. */
export function getArgon2(): Argon2idFunction {
  argon2 ??= createWorkerArgon2();
  return argon2;
}

/** Called with the app's other clean-up on lock, such as clearing cached server data. */
export function onLock(listener: () => void): () => void {
  lockListeners.add(listener);
  return () => lockListeners.delete(listener);
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    lockIfExpired();
  }, 1000);
}

/** Locks when the inactivity deadline has passed. Runs every second while unlocked. */
export function lockIfExpired(now: number = Date.now()): void {
  if (state.status === 'unlocked' && now >= state.lockAt) {
    lock();
  }
}

/**
 * Derives the key from the master password, unwraps the DEK, then downloads and decrypts every
 * record. A wrong password throws UnlockError from the crypto module.
 */
export async function unlock(masterPassword: string): Promise<void> {
  const info = await vaultApi.get();
  const key = await unlockVault(masterPassword, info.material, getArgon2());
  const vaultId = info.material.vaultId;
  const stored = await recordsApi.listAll();

  const logins: LoginEntry[] = [];
  const categories: Category[] = [];
  let damaged = 0;
  for (const record of stored) {
    try {
      const value = await decryptRecord(
        key,
        { vaultId, recordId: record.id, recordType: record.type },
        record,
      );
      if (record.type === 'LOGIN') {
        logins.push({ ...loginDataSchema.parse(value), ...meta(record) });
      } else {
        categories.push({ ...categoryDataSchema.parse(value), ...meta(record) });
      }
    } catch {
      damaged++;
    }
  }

  let settings = DEFAULT_SETTINGS;
  if (info.settings) {
    try {
      settings = settingsSchema.parse(await decryptSettings(key, vaultId, info.settings));
    } catch {
      damaged++;
    }
  }

  dek = key;
  set({
    status: 'unlocked',
    vaultId,
    keyVersion: info.keyVersion,
    logins: sortLogins(logins),
    categories: categories.sort((a, b) => a.name.localeCompare(b.name)),
    settings,
    damaged,
    lockAt: Date.now() + settings.autoLockMinutes * 60_000,
  });
  startTimer();
}

export function lock({ broadcast = true }: { broadcast?: boolean } = {}): void {
  const wasUnlocked = state.status === 'unlocked';
  dek = null;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  set(LOCKED);
  if (wasUnlocked) {
    for (const listener of lockListeners) listener();
  }
  if (broadcast) channel?.postMessage('lock');
}

/** User activity pushes the lock time back. Throttled to once a second. */
export function touch(): void {
  if (state.status !== 'unlocked') return;
  const now = Date.now();
  if (now - lastTouch < 1000) return;
  lastTouch = now;
  set({ ...state, lockAt: now + state.settings.autoLockMinutes * 60_000 });
}

export async function saveLogin(data: LoginData, existing?: LoginEntry): Promise<LoginEntry> {
  const current = unlocked();
  const value = loginDataSchema.parse(data);
  const id = existing?.id ?? crypto.randomUUID();
  const blob = await encryptRecord(
    requireKey(),
    { vaultId: current.vaultId, recordId: id, recordType: 'LOGIN' },
    value,
  );
  const stored = existing
    ? await recordsApi.update(id, existing.version, blob)
    : await recordsApi.create(id, 'LOGIN', blob);
  const entry: LoginEntry = { ...value, ...meta(stored) };
  const latest = unlocked();
  set({ ...latest, logins: sortLogins([...latest.logins.filter((l) => l.id !== id), entry]) });
  return entry;
}

export async function deleteLogin(id: string): Promise<void> {
  unlocked();
  await recordsApi.remove(id);
  const latest = unlocked();
  set({ ...latest, logins: latest.logins.filter((l) => l.id !== id) });
}

export async function saveCategory(data: CategoryData, existing?: Category): Promise<Category> {
  const current = unlocked();
  const value = categoryDataSchema.parse(data);
  const id = existing?.id ?? crypto.randomUUID();
  const blob = await encryptRecord(
    requireKey(),
    { vaultId: current.vaultId, recordId: id, recordType: 'CATEGORY' },
    value,
  );
  const stored = existing
    ? await recordsApi.update(id, existing.version, blob)
    : await recordsApi.create(id, 'CATEGORY', blob);
  const category: Category = { ...value, ...meta(stored) };
  const latest = unlocked();
  set({
    ...latest,
    categories: [...latest.categories.filter((c) => c.id !== id), category].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  });
  return category;
}

/** Entries in a deleted category simply show as uncategorized; nothing is re-encrypted. */
export async function deleteCategory(id: string): Promise<void> {
  unlocked();
  await recordsApi.remove(id);
  const latest = unlocked();
  set({ ...latest, categories: latest.categories.filter((c) => c.id !== id) });
}

export async function saveSettings(settings: VaultSettings): Promise<void> {
  const current = unlocked();
  const value = settingsSchema.parse(settings);
  await vaultApi.saveSettings(await encryptSettings(requireKey(), current.vaultId, value));
  const latest = unlocked();
  set({
    ...latest,
    settings: value,
    lockAt: Date.now() + value.autoLockMinutes * 60_000,
  });
}

/**
 * An encrypted backup of every login and category, as file text for the user to download. It is
 * built and encrypted here; nothing is sent to the server.
 */
export async function exportBackup(passphrase: string): Promise<string> {
  const current = unlocked();
  const contents: BackupContents = {
    schema: 1,
    exportedAt: new Date().toISOString(),
    categories: current.categories.map((c) => ({ ref: c.id, name: c.name })),
    logins: current.logins.map((l) => loginDataSchema.parse(l)),
  };
  return createBackup(passphrase, contents, getArgon2());
}

export interface ImportResult {
  logins: number;
  categories: number;
}

/** Batches stay well inside the server's 200-record and 8 MiB limits. */
const BATCH_COUNT = 100;
const BATCH_BYTES = 4 * 1024 * 1024;

/**
 * Decrypts a backup with its passphrase, then adds everything to this vault under new IDs,
 * encrypted with this vault's key. Nothing existing is replaced. Categories are matched by name.
 *
 * Each upload batch is all or nothing on the server, but a large import uses several batches; if
 * one fails, the batches before it stay imported.
 */
export async function importBackup(fileText: string, passphrase: string): Promise<ImportResult> {
  const before = unlocked();
  let contents: BackupContents;
  const opened = await openBackup(fileText, passphrase, getArgon2());
  try {
    contents = backupContentsSchema.parse(opened);
  } catch {
    throw new CryptoFormatError('The backup contents are not valid.');
  }

  const byName = new Map(before.categories.map((c) => [c.name.toLocaleLowerCase(), c.id]));
  const categoryIds = new Map<string, string>();
  const newCategories: { id: string; data: CategoryData }[] = [];
  for (const c of contents.categories) {
    const existing = byName.get(c.name.toLocaleLowerCase());
    if (existing) {
      categoryIds.set(c.ref, existing);
    } else {
      const id = crypto.randomUUID();
      categoryIds.set(c.ref, id);
      byName.set(c.name.toLocaleLowerCase(), id);
      newCategories.push({ id, data: { schema: 1, name: c.name } });
    }
  }
  const newLogins = contents.logins.map((l) => ({
    id: crypto.randomUUID(),
    data: loginDataSchema.parse({
      ...l,
      categoryId: l.categoryId ? (categoryIds.get(l.categoryId) ?? null) : null,
    }),
  }));

  // Damaged records could not be shown, but the server still counts them toward the limit.
  const total = before.logins.length + before.categories.length + before.damaged;
  if (total + newLogins.length + newCategories.length > 5000) {
    throw new ApiError(422, 'QUOTA_EXCEEDED');
  }

  const key = requireKey();
  const vaultId = before.vaultId;
  const items: { id: string; type: 'LOGIN' | 'CATEGORY'; blob: EncryptedBlob; value: unknown }[] =
    [];
  for (const c of newCategories) {
    const ref = { vaultId, recordId: c.id, recordType: 'CATEGORY' as const };
    items.push({
      id: c.id,
      type: 'CATEGORY',
      blob: await encryptRecord(key, ref, c.data),
      value: c.data,
    });
  }
  for (const l of newLogins) {
    const ref = { vaultId, recordId: l.id, recordType: 'LOGIN' as const };
    items.push({
      id: l.id,
      type: 'LOGIN',
      blob: await encryptRecord(key, ref, l.data),
      value: l.data,
    });
  }

  const values = new Map(items.map((i) => [i.id, i.value]));
  let batch: typeof items = [];
  let bytes = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    const stored = await recordsApi.createBatch(batch);
    const latest = unlocked();
    const logins = [...latest.logins];
    const categories = [...latest.categories];
    for (const record of stored) {
      if (record.type === 'LOGIN') {
        logins.push({ ...(values.get(record.id) as LoginData), ...meta(record) });
      } else {
        categories.push({ ...(values.get(record.id) as CategoryData), ...meta(record) });
      }
    }
    set({
      ...latest,
      logins: sortLogins(logins),
      categories: categories.sort((a, b) => a.name.localeCompare(b.name)),
    });
    batch = [];
    bytes = 0;
  };
  for (const item of items) {
    // Base64 grows data by a third; the estimate only needs to be on the safe side.
    const size = Math.ceil((item.blob.ciphertext.length + item.blob.nonce.length) * 1.4) + 200;
    if (batch.length === BATCH_COUNT || bytes + size > BATCH_BYTES) await flush();
    batch.push(item);
    bytes += size;
  }
  await flush();

  return { logins: newLogins.length, categories: newCategories.length };
}

/** After a master password change the DEK is the same; only the key version moved on. */
export function setKeyVersion(keyVersion: number): void {
  set({ ...unlocked(), keyVersion });
}

function requireKey(): CryptoKey {
  if (!dek) throw new Error('The vault is locked.');
  return dek;
}

function meta(record: StoredRecord) {
  return {
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function sortLogins(logins: LoginEntry[]): LoginEntry[] {
  return logins.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}
