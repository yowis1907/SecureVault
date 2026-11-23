import { clsx } from 'clsx';
import { useSyncExternalStore } from 'react';

/**
 * Short confirmations, announced politely to screen readers. A small store rather than a library,
 * because toast libraries inject <style> elements that the CSP blocks (ADR 0014). Messages must
 * never contain secrets.
 */
interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

let messages: ToastMessage[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function toast(text: string, tone: ToastMessage['tone'] = 'info'): void {
  const id = nextId++;
  messages = [...messages, { id, text, tone }].slice(-3);
  emit();
  setTimeout(() => {
    messages = messages.filter((m) => m.id !== id);
    emit();
  }, 4000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function ToastRegion() {
  const current = useSyncExternalStore(subscribe, () => messages);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {current.map((m) => (
        <p
          key={m.id}
          role={m.tone === 'error' ? 'alert' : 'status'}
          className={clsx(
            'glass-bar rise pointer-events-auto rounded-full px-5 py-2.5 text-sm font-medium text-text',
            m.tone === 'error' && 'text-danger',
          )}
        >
          {m.text}
        </p>
      ))}
    </div>
  );
}
