// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { argon2idHashWasm } from './argon2';
import { createBackup, openBackup } from './backup';
import { BackupOpenError, CryptoFormatError } from './errors';

const passphrase = 'test backup passphrase one';
const contents = { schema: 1, note: 'canary-backup-contents-7f3a', list: [1, 2, 3] };

type BackupFile = {
  header: {
    format: string;
    version: number;
    kdf: Record<string, unknown>;
    nonce: string;
  };
  ciphertext: string;
};

async function backupFile(): Promise<BackupFile> {
  return JSON.parse(await createBackup(passphrase, contents, argon2idHashWasm)) as BackupFile;
}

function flipFirstChar(b64: string): string {
  return (b64.startsWith('A') ? 'B' : 'A') + b64.slice(1);
}

describe('encrypted backup', () => {
  it('round-trips with the right passphrase', async () => {
    const text = await createBackup(passphrase, contents, argon2idHashWasm);
    expect(await openBackup(text, passphrase, argon2idHashWasm)).toEqual(contents);
  });

  it('contains no plaintext and uses the documented header', async () => {
    const text = await createBackup(passphrase, contents, argon2idHashWasm);
    expect(text).not.toContain('canary-backup-contents');
    expect(text).not.toContain(passphrase);
    const file = JSON.parse(text) as BackupFile;
    expect(file.header).toMatchObject({
      format: 'securevault-backup',
      version: 1,
      kdf: { algorithm: 'ARGON2ID', memoryKib: 65536, iterations: 3, parallelism: 1 },
    });
    expect(atob(file.header.nonce)).toHaveLength(12);
  });

  it('uses a fresh salt and nonce every time', async () => {
    const a = await backupFile();
    const b = await backupFile();
    expect(a.header.kdf.salt).not.toEqual(b.header.kdf.salt);
    expect(a.header.nonce).not.toEqual(b.header.nonce);
  });

  it('refuses a wrong passphrase', async () => {
    const text = await createBackup(passphrase, contents, argon2idHashWasm);
    await expect(openBackup(text, 'wrong passphrase', argon2idHashWasm)).rejects.toThrow(
      BackupOpenError,
    );
  });

  it('fails when the ciphertext or nonce is altered', async () => {
    for (const change of [
      (f: BackupFile) => ({ ...f, ciphertext: flipFirstChar(f.ciphertext) }),
      (f: BackupFile) => ({ ...f, header: { ...f.header, nonce: flipFirstChar(f.header.nonce) } }),
    ]) {
      const text = JSON.stringify(change(await backupFile()));
      await expect(openBackup(text, passphrase, argon2idHashWasm)).rejects.toThrow(BackupOpenError);
    }
  });

  it('fails when the header is changed, because it is authenticated', async () => {
    const file = await backupFile();
    // Still within the allowed range, so only the authentication can catch it.
    const kdf = { ...file.header.kdf, iterations: 4 };
    const text = JSON.stringify({ ...file, header: { ...file.header, kdf } });
    await expect(openBackup(text, passphrase, argon2idHashWasm)).rejects.toThrow(BackupOpenError);
  });

  it('refuses weakened key derivation without deriving anything', async () => {
    const file = await backupFile();
    const argon2 = vi.fn(argon2idHashWasm);
    const kdf = { ...file.header.kdf, memoryKib: 1024 };
    const text = JSON.stringify({ ...file, header: { ...file.header, kdf } });
    await expect(openBackup(text, passphrase, argon2)).rejects.toThrow(CryptoFormatError);
    expect(argon2).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', 'hello'],
    ['another JSON document', '{"vault": []}'],
    ['an unknown version', 'VERSION'],
    ['a short nonce', 'NONCE'],
  ])('refuses %s', async (_, kind) => {
    const file = await backupFile();
    const text =
      kind === 'VERSION'
        ? JSON.stringify({ ...file, header: { ...file.header, version: 2 } })
        : kind === 'NONCE'
          ? JSON.stringify({ ...file, header: { ...file.header, nonce: btoa('short') } })
          : kind;
    await expect(openBackup(text, passphrase, argon2idHashWasm)).rejects.toThrow(CryptoFormatError);
  });

  it('reads a file whose keys are in a different order', async () => {
    const file = await backupFile();
    const h = file.header;
    const reordered = {
      ciphertext: file.ciphertext,
      header: { nonce: h.nonce, kdf: { ...h.kdf }, version: h.version, format: h.format },
    };
    expect(await openBackup(JSON.stringify(reordered), passphrase, argon2idHashWasm)).toEqual(
      contents,
    );
  });
});
