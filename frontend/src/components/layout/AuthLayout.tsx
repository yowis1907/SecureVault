import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from './Wordmark';

/**
 * Sign-in, sign-up, and unlock: one liquid glass card in the middle of the wallpaper, with the
 * wordmark top left and an optional action top right.
 */
export function AuthBackdrop({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
        <Wordmark />
        {header}
      </header>
      <div className="flex flex-1 items-start justify-center px-4 pt-[6vh] pb-16 sm:items-center sm:pt-0">
        {children}
      </div>
    </div>
  );
}

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
    <AuthBackdrop>
      <main id="main" className="glass rise w-full max-w-[440px] p-8 sm:p-10">
        <h1 className="text-[2.5rem] leading-[1.1] font-semibold">{title}</h1>
        {intro ? <div className="mt-3 text-[0.9375rem] text-muted">{intro}</div> : null}
        <div className="mt-8">{children}</div>
        {footer ? (
          <div className="mt-8 border-t border-line/70 pt-6 text-center text-[0.9375rem] text-muted">
            {footer}
          </div>
        ) : null}
      </main>
    </AuthBackdrop>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-accent underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
