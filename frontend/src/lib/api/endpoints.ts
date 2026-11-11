/**
 * Typed calls for each endpoint in docs/API_SPECIFICATION.md. Binary fields travel as base64 and
 * are converted to bytes here, so the crypto module only ever sees bytes.
 */
import { base64ToBytes, bytesToBase64 } from '../../crypto/encoding';
import type { KdfParams } from '../../crypto/params';
import type { EncryptedBlob, RecordType } from '../../crypto/records';
import type { VaultKeyMaterial } from '../../crypto/vault-keys';
import { clearCsrfToken, refreshCsrfToken, request } from './client';

// --- Wire shapes ---

interface KdfWire {
  algorithm: 'ARGON2ID';
  memoryKib: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

interface VaultWire {
  vaultId: string;
  cryptoVersion: number;
  kdf: KdfWire;
  wrappedDek: string;
  wrapNonce: string;
  keyVersion: number;
  settings: { nonce: string; ciphertext: string } | null;
}

interface RecordWire {
  id: string;
  type: RecordType;
  cryptoVersion: number;
  nonce: string;
  ciphertext: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface VaultInfo {
  material: VaultKeyMaterial;
  keyVersion: number;
  settings: EncryptedBlob | null;
}

export interface StoredRecord extends EncryptedBlob {
  id: string;
  type: RecordType;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: number;
  type: string;
  recordId: string | null;
  occurredAt: string;
}

export interface SessionInfo {
  handle: string;
  createdAt: string;
  lastAccessedAt: string;
  current: boolean;
}

// --- Conversions ---

const kdfToWire = (kdf: KdfParams): KdfWire => ({
  algorithm: kdf.algorithm,
  memoryKib: kdf.memoryKib,
  iterations: kdf.iterations,
  parallelism: kdf.parallelism,
  salt: bytesToBase64(kdf.salt),
});

const kdfFromWire = (kdf: KdfWire): KdfParams => ({
  algorithm: kdf.algorithm,
  memoryKib: kdf.memoryKib,
  iterations: kdf.iterations,
  parallelism: kdf.parallelism,
  salt: base64ToBytes(kdf.salt),
});

const materialToWire = (m: VaultKeyMaterial) => ({
  vaultId: m.vaultId,
  cryptoVersion: m.cryptoVersion,
  kdf: kdfToWire(m.kdf),
  wrappedDek: bytesToBase64(m.wrappedDek),
  wrapNonce: bytesToBase64(m.wrapNonce),
});

const blobToWire = (b: EncryptedBlob) => ({
  cryptoVersion: b.cryptoVersion,
  nonce: bytesToBase64(b.nonce),
  ciphertext: bytesToBase64(b.ciphertext),
});

const recordFromWire = (r: RecordWire): StoredRecord => ({
  id: r.id,
  type: r.type,
  cryptoVersion: r.cryptoVersion,
  nonce: base64ToBytes(r.nonce),
  ciphertext: base64ToBytes(r.ciphertext),
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

// --- Authentication ---

export const auth = {
  register: (email: string, accountPassword: string, vault: VaultKeyMaterial) =>
    request<undefined>('POST', '/auth/register', {
      email,
      accountPassword,
      vault: materialToWire(vault),
    }),
  verifyEmail: (token: string) => request<undefined>('POST', '/auth/verify-email', { token }),
  resendVerification: (email: string) =>
    request<undefined>('POST', '/auth/verification/resend', { email }),
  async login(email: string, accountPassword: string): Promise<User> {
    const user = await request<User>('POST', '/auth/login', { email, accountPassword });
    await refreshCsrfToken();
    return user;
  },
  async logout(): Promise<void> {
    try {
      await request<undefined>('POST', '/auth/logout');
    } finally {
      clearCsrfToken();
    }
  },
  me: () => request<User>('GET', '/auth/me'),
  forgotPassword: (email: string) => request<undefined>('POST', '/auth/password/forgot', { email }),
  resetPassword: (token: string, newAccountPassword: string) =>
    request<undefined>('POST', '/auth/password/reset', { token, newAccountPassword }),
};

// --- Vault and records ---

export const vault = {
  async get(): Promise<VaultInfo> {
    const v = await request<VaultWire>('GET', '/vault');
    return {
      material: {
        vaultId: v.vaultId,
        cryptoVersion: v.cryptoVersion,
        kdf: kdfFromWire(v.kdf),
        wrappedDek: base64ToBytes(v.wrappedDek),
        wrapNonce: base64ToBytes(v.wrapNonce),
      },
      keyVersion: v.keyVersion,
      settings: v.settings
        ? {
            cryptoVersion: 1,
            nonce: base64ToBytes(v.settings.nonce),
            ciphertext: base64ToBytes(v.settings.ciphertext),
          }
        : null,
    };
  },
  replaceKeyMaterial: (
    accountPassword: string,
    expectedKeyVersion: number,
    material: VaultKeyMaterial,
  ) =>
    request<{ keyVersion: number }>('PUT', '/vault/key-material', {
      accountPassword,
      expectedKeyVersion,
      kdf: kdfToWire(material.kdf),
      wrappedDek: bytesToBase64(material.wrappedDek),
      wrapNonce: bytesToBase64(material.wrapNonce),
    }),
  saveSettings: (blob: EncryptedBlob) =>
    request<undefined>('PUT', '/vault/settings', {
      nonce: bytesToBase64(blob.nonce),
      ciphertext: bytesToBase64(blob.ciphertext),
    }),
  reset: (accountPassword: string, material: VaultKeyMaterial) =>
    request<undefined>('POST', '/vault/reset', {
      accountPassword,
      confirmation: 'DELETE MY VAULT',
      vault: materialToWire(material),
    }),
};

export const records = {
  /** Fetches every page; the client searches locally because the server cannot read records. */
  async listAll(): Promise<StoredRecord[]> {
    const all: StoredRecord[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor
        ? `?limit=1000&cursor=${encodeURIComponent(cursor)}`
        : '?limit=1000';
      const page: { records: RecordWire[]; nextCursor: string | null } = await request(
        'GET',
        `/vault/records${query}`,
      );
      all.push(...page.records.map(recordFromWire));
      cursor = page.nextCursor;
    } while (cursor);
    return all;
  },
  async create(id: string, type: RecordType, blob: EncryptedBlob): Promise<StoredRecord> {
    return recordFromWire(
      await request<RecordWire>('POST', '/vault/records', { id, type, ...blobToWire(blob) }),
    );
  },
  async update(id: string, version: number, blob: EncryptedBlob): Promise<StoredRecord> {
    return recordFromWire(
      await request<RecordWire>('PUT', `/vault/records/${id}`, { version, ...blobToWire(blob) }),
    );
  },
  remove: (id: string) => request<undefined>('DELETE', `/vault/records/${id}`),
};

// --- Account and activity ---

export const account = {
  changePassword: (currentAccountPassword: string, newAccountPassword: string) =>
    request<undefined>('PUT', '/account/password', { currentAccountPassword, newAccountPassword }),
  sessions: () => request<{ sessions: SessionInfo[] }>('GET', '/account/sessions'),
  revokeSession: (handle: string) => request<undefined>('DELETE', `/account/sessions/${handle}`),
  revokeOtherSessions: () => request<undefined>('DELETE', '/account/sessions'),
  delete: (accountPassword: string) =>
    request<undefined>('POST', '/account/deletion', {
      accountPassword,
      confirmation: 'DELETE MY ACCOUNT',
    }),
};

export const activity = {
  latest: (limit = 50) =>
    request<{ events: ActivityEvent[] }>('GET', `/activity?limit=${String(limit)}`),
};
