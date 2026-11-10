import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from './Wordmark';

/** Sign-in and sign-up pages: one narrow column, nothing competing with the form. */
export function AuthLayout({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <Wordmark />
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 py-8 sm:py-16">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {intro ? <div className="mt-2 text-muted">{intro}</div> : null}
          <div className="mt-8">{children}</div>
          {footer ? (
            <div className="mt-8 border-t border-line pt-6 text-sm text-muted">{footer}</div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-accent underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
