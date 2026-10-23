/**
 * Registration (RAPP-615, RAPP-641): everything a player sees the first time
 * she opens the app, as a board of screens in her order. Each card opens its
 * screen's editor (`/onboarding/screens/<id>`); the More menu downloads and
 * imports the whole setup (RAPP-621) and resets the order.
 *
 * Settings shows the same editors in its tabs. This page exists so the
 * onboarding design role, which holds `onboarding.design` and nothing of
 * Settings, reaches them without the rest of Settings. `ssr: false` for the
 * reason every staff screen gives (the session lives in localStorage,
 * ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { Page, PageHeader } from '@/components/layout/page';
import { BoardMenu } from '@/components/onboarding/board-menu';
import { ScreenBoard } from '@/components/onboarding/screen-board';
import { ONBOARDING_PERMISSIONS } from '@/lib/nav-items';
import { loadOnboardingDesign } from '@/lib/onboarding-design';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_staff/onboarding/')({
  ssr: false,
  loader: loadOnboardingDesign,
  component: OnboardingPage,
});

function OnboardingPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={ONBOARDING_PERMISSIONS}>
      <OnboardingBoard />
    </RequireAuth>
  );
}

function OnboardingBoard() {
  const data = Route.useLoaderData();
  const { t } = useTranslation('settings');
  return (
    <Page data-testid="onboarding-design-page">
      <PageHeader
        title={t('onboardingPage.title')}
        actions={<BoardMenu canImport={data.canPublishTerms} />}
      />
      <ScreenBoard catalog={data.intakeCatalog} />
    </Page>
  );
}
