import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ToastRegion } from '../components/ui/Toast';
import { AccountPage } from '../features/account/AccountPage';
import { VaultResetPage } from '../features/account/VaultResetPage';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../features/auth/EmailLinkPages';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { GeneratorPage } from '../features/generator/GeneratorPage';
import { LandingPage } from '../features/landing/LandingPage';
import { SecurityPage } from '../features/security/SecurityPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { UnlockPage } from '../features/unlock/UnlockPage';
import { EntryEditorPage } from '../features/vault/EntryEditorPage';
import { VaultPage } from '../features/vault/VaultPage';
import { AppShell } from './AppShell';
import { RequireSession, RequireUnlocked } from './guards';
import { createQueryClient } from './query-client';

export const routes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/unlock',
    element: (
      <RequireSession>
        <UnlockPage />
      </RequireSession>
    ),
  },
  {
    path: '/reset-vault',
    element: (
      <RequireSession>
        <VaultResetPage />
      </RequireSession>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireSession>
        <RequireUnlocked>
          <AppShell />
        </RequireUnlocked>
      </RequireSession>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'vault', element: <VaultPage /> },
      { path: 'vault/new', element: <EntryEditorPage /> },
      { path: 'vault/:id', element: <VaultPage /> },
      { path: 'vault/:id/edit', element: <EntryEditorPage /> },
      { path: 'generator', element: <GeneratorPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'account', element: <AccountPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastRegion />
    </QueryClientProvider>
  );
}
