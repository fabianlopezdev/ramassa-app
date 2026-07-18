/**
 * Magic-link callback (RAPP-13). Supabase redirects here with the session
 * tokens in the URL. We validate the origin and open the session on the client
 * (the tokens ride in the URL fragment, which never reaches the server), then
 * the auth-state change routes the user to their role landing. An expired or
 * untrusted link shows the translated `AUTH-*` error with a way back to login.
 */

import { AuthFormError } from '@/components/auth/auth-form-error';
import { AuthLoading } from '@/components/auth/auth-loading';
import { Button } from '@/components/ui/button';
import { completeMagicLink, roleLandingPath } from '@/lib/auth';
import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';

export const Route = createFileRoute('/auth/callback')({
  component: CallbackPage,
});

function CallbackPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const { session, role } = useAuth();
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  useEffect(() => {
    // The fragment tokens only exist in the browser.
    if (typeof window === 'undefined') {
      return;
    }
    let cancelled = false;
    void completeMagicLink(window.location.href).then((result) => {
      if (!cancelled && !result.ok) {
        setErrorCode(result.error.code);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the session lands (a resolved role), route to the right home.
  if (session && role) {
    return <Navigate to={roleLandingPath(role)} />;
  }

  if (errorCode) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        <div className="w-full max-w-sm">
          <AuthFormError code={errorCode} />
        </div>
        <Button variant="outline" onClick={() => navigate({ to: '/login' })}>
          {t('loginTitle')}
        </Button>
      </main>
    );
  }

  return <AuthLoading label={t('signingIn')} />;
}
