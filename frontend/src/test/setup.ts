import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { argon2idHashWasm } from '../crypto/argon2';
import { configureArgon2, lock } from '../vault-session/session';
import { fake, server } from './fake-server';

// jsdom does not implement <dialog>'s modal methods. This stand-in only toggles `open` and fires
// `close`; real focus trapping and Escape handling are checked in a browser.
if (typeof HTMLDialogElement !== 'undefined' && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.open = true;
    },
    close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
}

// Web Workers do not exist in jsdom, so tests run Argon2id in-process with the same library.
configureArgon2(argon2idHashWasm);

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  cleanup();
  lock({ broadcast: false });
  server.resetHandlers();
  fake.reset();
});
afterAll(() => {
  server.close();
});
