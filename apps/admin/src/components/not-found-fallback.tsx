import { Button } from '@/components/ui/button';
import { createAdminI18n, resolveClientLanguage } from '@/lib/i18n';
import { useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@ramassa/shared/i18n';

function NotFoundFallbackContent() {
  const { t } = useTranslation('common');

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-center text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="text-muted-foreground text-center text-lg">{t('notFound.description')}</p>
      <Button asChild>
        <a href="/">{t('notFound.returnHome')}</a>
      </Button>
    </main>
  );
}

export function NotFoundFallbackForLanguage({ language }: { language: SupportedLanguage }) {
  const [i18n] = useState(() => createAdminI18n(language));

  return (
    <I18nextProvider i18n={i18n}>
      <NotFoundFallbackContent />
    </I18nextProvider>
  );
}

export function NotFoundFallback() {
  return <NotFoundFallbackForLanguage language={resolveClientLanguage()} />;
}
