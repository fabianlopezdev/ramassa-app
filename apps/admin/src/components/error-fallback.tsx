/**
 * Translated, accessible router error fallback (RAPP-12): friendly translated
 * message plus the short stable code (e.g. `AUTH-3`) staff can quote when
 * reporting a problem. Wraps its own I18nextProvider because the router mounts
 * it OUTSIDE the root route's provider tree.
 */

import { Button } from '@/components/ui/button';
import { createAdminI18n, resolveClientLanguage } from '@/lib/i18n';
import { logger } from '@/lib/observability';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';

function ErrorFallbackContent({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation('errors');
  const appError = toAppError(error);
  const friendlyMessage = t(getErrorMessageKey(appError.code));

  useEffect(() => {
    // The boundary caught a render-time crash the safeAsync path never saw;
    // this is its single report to the log + Sentry.
    logger.error('router error boundary rendered', { error: appError, code: appError.code });
    // Depends only on the code: report once per caught error.
  }, [appError.code]);

  return (
    <main role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-center text-2xl font-bold">{t('fallbackTitle')}</h1>
      <p className="text-center text-lg">{friendlyMessage}</p>
      <p className="text-muted-foreground text-center text-sm">
        {t('errorCodeLabel')}: {appError.code}
      </p>
      <Button onClick={reset}>{t('retry')}</Button>
    </main>
  );
}

export function ErrorFallback(props: ErrorComponentProps) {
  // Own instance because this mounts outside the root route's provider; the
  // language is resolved client-side (cookie, then browser languages).
  const [i18n] = useState(() => createAdminI18n(resolveClientLanguage()));
  return (
    <I18nextProvider i18n={i18n}>
      <ErrorFallbackContent {...props} />
    </I18nextProvider>
  );
}
