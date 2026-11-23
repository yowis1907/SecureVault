import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * The native <dialog> with showModal(): the browser makes the rest of the page inert, keeps focus
 * inside, closes on Escape, and returns focus afterwards. No script-injected styles (ADR 0014).
 */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      className="glass-bar m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] p-0 text-text"
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="glass-clear rounded-full p-1.5 text-muted hover:text-text"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="px-6 pt-2 pb-6">{open ? children : null}</div>
    </dialog>
  );
}
