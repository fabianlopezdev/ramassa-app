import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_entity/portal/')({
  component: PortalPage,
});

/**
 * The entity landing (`/portal`, per roleLandingPath in RAPP-13). A section, not
 * a main: the _entity layout already provides the page's `main` landmark.
 */
function PortalPage() {
  const { t } = useTranslation('admin');
  return (
    <section className="p-6">
      <h1 className="text-lg font-semibold text-foreground">{t('admin:portalTitle')}</h1>
    </section>
  );
}
