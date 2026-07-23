/**
 * A tiny shared channel for the current auth-flow error code (RAPP-13). The
 * login forms and the global deep-link handler both feed it, and the login
 * screen renders a single banner from it. It exists because the magic-link
 * callback is processed ABOVE the navigator (a deep link can arrive while the
 * login screen is mounted), so an expired-link error (`AUTH-4`) needs a way to
 * reach that screen instead of only being logged.
 */

import { createContext, use, useMemo, useState, type ReactNode } from 'react';
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';

interface AuthFlowStatus {
  readonly errorCode: AppErrorCode | null;
  readonly setErrorCode: (code: AppErrorCode | null) => void;
}

const AuthFlowStatusContext = createContext<AuthFlowStatus | null>(null);

export function AuthFlowStatusProvider({ children }: { children: ReactNode }) {
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const value = useMemo<AuthFlowStatus>(() => ({ errorCode, setErrorCode }), [errorCode]);
  return <AuthFlowStatusContext value={value}>{children}</AuthFlowStatusContext>;
}

export function useAuthFlowStatus(): AuthFlowStatus {
  const value = use(AuthFlowStatusContext);
  if (!value) {
    throw new AppError('UNEXPECTED-1', {
      message: 'useAuthFlowStatus must be used within an <AuthFlowStatusProvider>',
    });
  }
  return value;
}
