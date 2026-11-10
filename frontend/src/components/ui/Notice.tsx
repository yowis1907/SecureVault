import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'warn' | 'danger' | 'success';

const tones: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2',
  warn: 'border-warn bg-warn-soft',
  danger: 'border-danger bg-danger-soft',
  success: 'border-accent bg-accent-soft',
};

/** An inline message. Errors use role="alert" so they are announced when they appear. */
export function Notice({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={clsx(
        'rounded-[var(--radius-control)] border-l-4 px-4 py-3 text-sm',
        tones[tone],
        className,
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={clsx(title && 'mt-1')}>{children}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
      />
      {label}
    </span>
  );
}
