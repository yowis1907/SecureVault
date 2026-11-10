/**
 * Copies a secret and overwrites the clipboard after a delay. Best effort only: the browser may
 * refuse the write when the page is not focused, and clipboard history or other applications can
 * keep a copy. The UI says so instead of promising more.
 */
import { onLock } from './session';

let clearTimer: ReturnType<typeof setTimeout> | null = null;

async function clearNow(): Promise<void> {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  try {
    await navigator.clipboard.writeText('');
  } catch {
    // Not focused or not permitted. Nothing more can be done from a web page.
  }
}

export async function copySecret(text: string, clearAfterSeconds: number): Promise<void> {
  await navigator.clipboard.writeText(text);
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    void clearNow();
  }, clearAfterSeconds * 1000);
}

/** Plain values such as usernames are copied without a timer. */
export async function copyPlain(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// Locking clears a pending secret right away instead of waiting for the timer.
onLock(() => {
  if (clearTimer) void clearNow();
});
