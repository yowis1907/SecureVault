import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { SceneBackdrop } from '../scene/SceneBackdrop';
import { Wordmark } from './Wordmark';

/**
 * Sign-in, sign-up, and unlock: one glass panel over a quiet version of the 3D scene, so the
 * form has nothing competing with it but the page still feels like the same place as the landing.
 */
export function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <SceneBackdrop intensity="ambient" className="fixed inset-0" />
      <div className="grid-field pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="relative flex flex-1 flex-col">{children}</div>
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
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4">
        <Wordmark />
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 py-8 sm:py-14">
        <div className="glass rise h-fit w-full max-w-md p-6 sm:p-8">
          <h1 className="display text-2xl font-bold">{title}</h1>
          {intro ? <div className="mt-2 text-muted">{intro}</div> : null}
          <div className="mt-8">{children}</div>
          {footer ? (
            <div className="mt-8 border-t border-line pt-6 text-sm text-muted">{footer}</div>
          ) : null}
        </div>
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
