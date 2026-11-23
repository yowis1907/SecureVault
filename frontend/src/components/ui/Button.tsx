import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-fill text-on-accent border border-transparent shadow-[0_6px_18px_-6px_color-mix(in_oklab,var(--sv-accent-fill)_60%,transparent)] hover:brightness-110',
  secondary: 'glass-clear text-text hover:bg-[var(--sv-glass-strong)]',
  ghost: 'bg-transparent text-text border border-transparent hover:bg-[var(--sv-glass)]',
  danger: 'bg-danger text-white border border-transparent hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-5 text-[0.9375rem] gap-2',
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
        'inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap',
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
