import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_staff/messages/')({
  component: StaffMessagesLanding,
});

function StaffMessagesLanding() {
  const { t } = useTranslation('messaging');
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{t('staffTitle')}</h1>
      <p className="mt-2 text-muted-foreground">{t('staffIntro')}</p>
    </main>
  );
}
