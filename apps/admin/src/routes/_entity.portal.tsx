import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_entity/portal')({
  component: PortalPage,
});

function PortalPage() {
  const { t } = useTranslation('admin');
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-lg font-semibold text-neutral-900">{t('admin:portalTitle')}</h1>
    </main>
  );
}
