import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'cta bg-accent text-on-accent hover:bg-accent-strong border border-transparent',
  secondary: 'bg-surface text-text border border-line hover:bg-surface-2',
  ghost: 'bg-transparent text-text border border-transparent hover:bg-surface-2',
  danger: 'bg-danger text-surface border border-transparent hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? busy}
      aria-busy={busy || undefined}
      className={clsx(
        'inline-flex items-center justify-center rounded-[var(--radius-control)] font-medium whitespace-nowrap',
        'cursor-pointer transition-[background-color,border-color,color,transform,box-shadow] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
