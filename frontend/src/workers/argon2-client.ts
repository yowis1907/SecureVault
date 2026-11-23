import type { Argon2idFunction } from '../crypto/argon2';
import { KeyDerivationError } from '../crypto/errors';
import { trustedWorkerUrl } from '../lib/trusted-types';
import type { Argon2Request, Argon2Response } from './argon2-protocol';
// Vite builds the worker as its own file and gives its URL here.
import argon2WorkerUrl from './argon2.worker.ts?worker&url';

/** The part of the Worker interface this client uses, so tests can supply a stand-in. */
export interface Argon2WorkerLike {
  onmessage: ((event: MessageEvent<Argon2Response>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: Argon2Request, transfer: Transferable[]): void;
  terminate(): void;
}

function startWorker(): Argon2WorkerLike {
  // The URL passes through the Trusted Types policy, which the CSP requires for workers.
  return new Worker(trustedWorkerUrl(argon2WorkerUrl), { type: 'module' });
}

/**
 * Runs each derivation in a fresh worker and terminates it afterwards, which releases the 64 MiB
 * or more of Argon2 memory instead of keeping it allocated for the rest of the session.
 */
export function createWorkerArgon2(createWorker = startWorker): Argon2idFunction {
  return (password, kdf) =>
    new Promise((resolve, reject) => {
      const worker = createWorker();
      worker.onmessage = (event) => {
        worker.terminate();
        if (event.data.ok) {
          resolve(event.data.output);
        } else {
          reject(new KeyDerivationError());
        }
      };
      worker.onerror = () => {
        worker.terminate();
        reject(new KeyDerivationError());
      };
      try {
        // Transferring moves the password bytes to the worker; this side's view becomes empty.
        worker.postMessage({ password, kdf }, [password.buffer]);
      } catch {
        // For example, a buffer already transferred by an earlier call.
        worker.terminate();
        reject(new KeyDerivationError());
      }
    });
}
