import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SceneBackdrop } from '../scene/SceneBackdrop';
import { Wordmark } from './Wordmark';

/**
 * Sign-in, sign-up, and unlock: the form on the left, the vault on the right under the same
 * spotlight as the landing page. On narrow screens the vault is left out and the form is alone.
 */
export function AuthBackdrop({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <div
        className="spotlight pointer-events-none absolute inset-x-0 top-0 h-screen"
        aria-hidden="true"
      />
      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Wordmark />
        {header}
      </header>
      <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-6 pb-12 lg:grid-cols-[minmax(0,28rem)_1fr]">
        <div className="flex w-full justify-center lg:justify-start">{children}</div>
        <SceneBackdrop
          intensity="ambient"
          className="relative hidden h-[min(70vh,620px)] lg:block"
        />
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
      <main id="main" className="panel rise w-full max-w-md p-7 sm:p-9">
        <h1 className="display text-3xl font-semibold">{title}</h1>
        {intro ? <div className="mt-3 text-muted">{intro}</div> : null}
        <div className="mt-8">{children}</div>
        {footer ? (
          <div className="mt-8 border-t border-line pt-6 text-sm text-muted">{footer}</div>
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
