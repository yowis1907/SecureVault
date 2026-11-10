/// <reference lib="webworker" />
import { handleArgon2Request, type Argon2Request } from './argon2-protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<Argon2Request>) => {
  const response = await handleArgon2Request(event.data);
  // Transfer the output instead of copying it, so no second copy stays in this worker.
  self.postMessage(response, response.ok ? [response.output.buffer] : []);
};
