import { clsx } from 'clsx';
import { Eye, EyeOff } from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

const inputClass =
  'w-full rounded-[var(--radius-control)] border border-line/80 bg-surface/70 px-4 py-2 text-base text-text ' +
  'placeholder:text-muted transition-[border-color,box-shadow] duration-150 ' +
  'focus:border-accent focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--sv-accent)_18%,transparent)] focus:outline-none ' +
  'aria-[invalid=true]:border-danger';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

/** Label above, hint and error below, both tied to the input with aria-describedby. */
function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, id: givenId, ...rest },
  ref,
) {
  const generated = useId();
  const id = givenId ?? generated;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={clsx(inputClass, 'h-12', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Monospace makes each character distinct; used for vault secrets, not for sign-in forms. */
  monospace?: boolean;
}

/**
 * Masked by default. The reveal button is a real button so it works from the keyboard.
 *
 * Master password fields pass autoComplete="off": "new-password" or "current-password" would
 * invite the browser's own password manager to save the one key that opens the vault.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { label, hint, error, className, id: givenId, monospace = false, ...rest },
    ref,
  ) {
    const generated = useId();
    const id = givenId ?? generated;
    const [visible, setVisible] = useState(false);
    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, hint, error)}
            className={clsx(inputClass, 'h-12 pr-12', monospace && 'secret', className)}
            {...rest}
          />
          <button
            type="button"
            onClick={() => {
              setVisible((v) => !v);
            }}
            aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[var(--radius-control)] text-muted hover:text-text"
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </FieldShell>
    );
  },
);

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, hint, error, className, id: givenId, ...rest }, ref) {
    const generated = useId();
    const id = givenId ?? generated;
    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
        <textarea
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={clsx(inputClass, 'min-h-24', className)}
          {...rest}
        />
      </FieldShell>
    );
  },
);
