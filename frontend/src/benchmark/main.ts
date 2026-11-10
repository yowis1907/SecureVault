/**
 * Development tool, not part of the app build. Measures how long one vault unlock's key
 * derivation takes on the current device. See `npm run benchmark`.
 */
import { utf8Encode } from '../crypto/encoding';
import { newKdfParams } from '../crypto/params';
import { createWorkerArgon2 } from '../workers/argon2-client';

const RUNS = 5;
const button = document.querySelector<HTMLButtonElement>('#run');
const output = document.querySelector<HTMLPreElement>('#output');

function log(line: string): void {
  if (output) {
    output.textContent += `${line}\n`;
  }
}

async function run(): Promise<void> {
  const argon2 = createWorkerArgon2();
  const kdf = newKdfParams();
  log(
    `Parameters: ${String(kdf.memoryKib)} KiB, t=${String(kdf.iterations)}, p=${String(kdf.parallelism)}`,
  );
  const times: number[] = [];
  for (let i = 1; i <= RUNS; i++) {
    const start = performance.now();
    await argon2(utf8Encode('benchmark-test-password'), kdf);
    const ms = Math.round(performance.now() - start);
    times.push(ms);
    log(`Run ${String(i)}: ${String(ms)} ms`);
  }
  const sorted = times.toSorted((a, b) => a - b);
  log(`Median: ${String(sorted[Math.floor(sorted.length / 2)])} ms`);
  log(`User agent: ${navigator.userAgent}`);
}

button?.addEventListener('click', () => {
  if (output) {
    output.textContent = '';
  }
  button.disabled = true;
  run()
    .catch(() => {
      log('Failed. The device may not have enough free memory.');
    })
    .finally(() => {
      button.disabled = false;
    });
});
