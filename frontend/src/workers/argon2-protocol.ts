/**
 * Messages between the app and the Argon2 worker. Kept apart from the worker entry point so the
 * handler can be tested without a real Worker.
 */
import { argon2idHashWasm } from '../crypto/argon2';
import type { Bytes } from '../crypto/encoding';
import type { KdfParams } from '../crypto/params';

export interface Argon2Request {
  password: Bytes;
  kdf: KdfParams;
}

/** Failure carries no detail, so no input can leak through an error message. */
export type Argon2Response = { ok: true; output: Bytes } | { ok: false };

export async function handleArgon2Request(request: Argon2Request): Promise<Argon2Response> {
  try {
    return { ok: true, output: await argon2idHashWasm(request.password, request.kdf) };
  } catch {
    return { ok: false };
  } finally {
    request.password.fill(0);
  }
}
