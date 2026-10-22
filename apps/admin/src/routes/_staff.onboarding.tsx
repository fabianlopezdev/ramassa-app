/**
 * Everything a player sees the first time she opens the app, on one page
 * (RAPP-615): the screens with their order and wording (RAPP-612), the
 * questions, the document step note, the app terms (RAPP-613), and the
 * seasons with their authorization, and moving the whole setup to another
 * organization (RAPP-621).
 *
 * Settings shows the same sections in its tabs. This page exists so the
 * onboarding design role, which holds `onboarding.design` and nothing of
 * Settings, reaches them without the rest of Settings. `ssr: false` for the
 * reason every staff screen gives (the session lives in localStorage,
 * ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { Page, PageHeader, PageSection } from '@/components/layout/page';
import {
  OnboardingAppTermsSection,
  OnboardingAuthorizationSection,
  OnboardingDocumentSection,
  OnboardingQuestionsSection,
  OnboardingScreensSection,
  OnboardingSetupTransferSection,
} from '@/components/settings/onboarding-design-sections';
import { ONBOARDING_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchAuthorizationVersions } from '@ramassa/shared/authorization';
import { fetchAppTermsVersions, fetchDocumentStepExplanation } from '@ramassa/shared/intake';
import { EMPTY_INTAKE_CATALOG, fetchIntakeCatalog } from '@ramassa/shared/intake-builder';
import { canDesignOnboarding, fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

export const Route = createFileRoute('/_staff/onboarding')({
  ssr: false,
  loader: async () => {
    // A person who may not design the onboarding gets nothing loaded: the
    // guard below sends her away, and the database would refuse her anyway.
    const permissions = await fetchMyPermissions(supabase);
    if (!canDesignOnboarding(permissions)) {
      return {
        intakeCatalog: EMPTY_INTAKE_CATALOG,
        documentExplanation: null,
        seasons: [],
        versions: [],
        termsVersions: [],
        canPublishTerms: false,
      };
    }
    const [intakeCatalog, documentExplanation, seasons, versions, termsVersions] =
      await Promise.all([
        fetchIntakeCatalog(supabase),
        fetchDocumentStepExplanation(supabase),
        fetchSeasons(supabase),
        fetchAuthorizationVersions(supabase),
        fetchAppTermsVersions(supabase),
      ]);
    return {
      intakeCatalog,
      documentExplanation,
      seasons,
      versions,
      termsVersions,
      canPublishTerms: permissions.has('settings.organization'),
    };
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={ONBOARDING_PERMISSIONS}>
      <OnboardingDesignScreen />
    </RequireAuth>
  );
}

function OnboardingDesignScreen() {
  const data = Route.useLoaderData();
  const { t } = useTranslation('settings');
  return (
    <Page className="gap-10" data-testid="onboarding-design-page">
      <PageHeader title={t('onboardingPage.title')} description={t('onboardingPage.intro')} />

      {/* Staging to production at launch (RAPP-621): admins import, designers download. */}
      <OnboardingSetupTransferSection canImport={data.canPublishTerms} />

      <PageSection
        title={t('builtinScreens.sectionTitle')}
        description={t('builtinScreens.sectionIntro')}
      >
        <OnboardingScreensSection catalog={data.intakeCatalog} />
      </PageSection>

      <PageSection title={t('tabQuestions')} description={t('questionsIntro')}>
        <OnboardingQuestionsSection catalog={data.intakeCatalog} />
        <OnboardingDocumentSection explanation={data.documentExplanation} />
      </PageSection>

      <PageSection title={t('appTerms.sectionTitle')} description={t('appTerms.sectionIntro')}>
        <OnboardingAppTermsSection
          versions={data.termsVersions}
          canPublish={data.canPublishTerms}
        />
      </PageSection>

      <PageSection title={t('tabAuthorization')} description={t('authorizationIntro')}>
        <OnboardingAuthorizationSection
          seasons={data.seasons}
          versions={data.versions}
          canPublish={data.canPublishTerms}
        />
      </PageSection>
    </Page>
  );
}
