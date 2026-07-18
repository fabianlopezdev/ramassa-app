import { Button } from '@/components/ui/button';
import { logout } from '@/lib/auth';
import { safeAsync } from '@/lib/observability';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppError } from '@ramassa/shared/errors';

export const Route = createFileRoute('/_staff/dashboard')({
  component: DashboardPage,
});

/**
 * RAPP-12 acceptance drivers, dev only: one button throws during render to
 * exercise defaultErrorComponent, the other fails inside safeAsync to
 * exercise logger -> Sentry. Dev-only strings are exempt from
 * no-literal-string: users never see them.
 */
function triggerForcedSafeAsyncFailure() {
  void safeAsync(() => Promise.reject(new Error('forced async failure (RAPP-12 dev trigger)')), {
    code: 'NETWORK-1',
    context: { trigger: 'dev-button' },
  });
}

function DevForcedErrorTriggers() {
  const [shouldThrowInRender, setShouldThrowInRender] = useState(false);

  if (shouldThrowInRender) {
    throw new AppError('UNEXPECTED-1', { message: 'forced render error (RAPP-12 dev trigger)' });
  }

  return (
    <div className="mt-8 flex gap-2">
      {/* eslint-disable-next-line i18next/no-literal-string -- dev-only trigger */}
      <Button variant="destructive" onClick={() => setShouldThrowInRender(true)}>
        DEV: crash render
      </Button>
      {/* eslint-disable-next-line i18next/no-literal-string -- dev-only trigger */}
      <Button variant="outline" onClick={triggerForcedSafeAsyncFailure}>
        DEV: fail safeAsync
      </Button>
    </div>
  );
}

function DashboardPage() {
  const { t } = useTranslation(['admin', 'auth']);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-lg font-semibold text-foreground">{t('admin:dashboardTitle')}</h1>
      {/* Signing out clears the session; RequireAuth then redirects to /login. */}
      <Button variant="outline" onClick={() => void logout()}>
        {t('auth:signOutAction')}
      </Button>
      {import.meta.env.DEV ? <DevForcedErrorTriggers /> : null}
    </main>
  );
}
