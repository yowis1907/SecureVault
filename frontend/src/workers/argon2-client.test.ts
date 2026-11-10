// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { argon2idHashWasm } from '../crypto/argon2';
import { KeyDerivationError, UnlockError } from '../crypto/errors';
import { newKdfParams } from '../crypto/params';
import { createVaultKeys, unlockVault } from '../crypto/vault-keys';
import { createWorkerArgon2, type Argon2WorkerLike } from './argon2-client';
import { handleArgon2Request, type Argon2Request, type Argon2Response } from './argon2-protocol';

/** Runs the real handler in-process, with structured cloning and transfer like a real worker. */
class InProcessWorker implements Argon2WorkerLike {
  onmessage: ((event: MessageEvent<Argon2Response>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  received: Argon2Request | undefined;

  constructor(private readonly crash = false) {}

  postMessage(message: Argon2Request, transfer: Transferable[]): void {
    this.received = structuredClone(message, { transfer });
    if (this.crash) {
      queueMicrotask(() => this.onerror?.(new Event('error') as ErrorEvent));
      return;
    }
    void handleArgon2Request(this.received).then((data) => {
      this.onmessage?.(new MessageEvent('message', { data }));
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('Argon2 worker client', () => {
  it('gives the same result as calling hash-wasm directly', async () => {
    const kdf = newKdfParams();
    const worker = new InProcessWorker();
    const viaWorker = await createWorkerArgon2(() => worker)(new Uint8Array([1, 2, 3]), kdf);
    const direct = await argon2idHashWasm(new Uint8Array([1, 2, 3]), kdf);
    expect(viaWorker).toEqual(direct);
    expect(worker.terminated).toBe(true);
  });

  it('moves the password to the worker and the worker clears it after use', async () => {
    const worker = new InProcessWorker();
    const password = new Uint8Array([9, 9, 9]);
    await createWorkerArgon2(() => worker)(password, newKdfParams());
    expect(password.byteLength).toBe(0);
    expect(Array.from(worker.received?.password ?? [1])).toEqual([0, 0, 0]);
  });

  it('works end to end for creating and unlocking a vault', async () => {
    const argon2 = createWorkerArgon2(() => new InProcessWorker());
    const vaultId = crypto.randomUUID();
    const { material } = await createVaultKeys('worker test password', vaultId, argon2);
    await expect(unlockVault('worker test password', material, argon2)).resolves.toBeDefined();
    await expect(unlockVault('wrong', material, argon2)).rejects.toThrow(UnlockError);
  });

  it('reports a failed derivation without detail', async () => {
    const worker = new InProcessWorker();
    const weak = { ...newKdfParams(), iterations: 1 };
    await expect(createWorkerArgon2(() => worker)(new Uint8Array([1]), weak)).rejects.toThrow(
      KeyDerivationError,
    );
    expect(worker.terminated).toBe(true);
  });

  it('terminates the worker and reports our error if the message cannot be sent', async () => {
    const worker = new InProcessWorker();
    const argon2 = createWorkerArgon2(() => worker);
    const password = new Uint8Array([1, 2, 3]);
    await argon2(password, newKdfParams());

    // The first call transferred the buffer, so reusing the same array cannot be sent again.
    const second = new InProcessWorker();
    await expect(createWorkerArgon2(() => second)(password, newKdfParams())).rejects.toThrow(
      KeyDerivationError,
    );
    expect(second.terminated).toBe(true);
  });

  it('reports a crashed worker, for example out of memory', async () => {
    const worker = new InProcessWorker(true);
    await expect(
      createWorkerArgon2(() => worker)(new Uint8Array([1]), newKdfParams()),
    ).rejects.toThrow(KeyDerivationError);
    expect(worker.terminated).toBe(true);
  });
});
