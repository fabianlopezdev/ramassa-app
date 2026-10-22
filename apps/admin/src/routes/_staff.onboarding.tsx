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
    <section className="flex flex-col gap-10 p-6" data-testid="onboarding-design-page">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-start text-2xl font-semibold">{t('onboardingPage.title')}</h1>
        <p className="text-start text-sm leading-6 text-muted-foreground">
          {t('onboardingPage.intro')}
        </p>
      </header>

      {/* Staging to production at launch (RAPP-621): admins import, designers download. */}
      <OnboardingSetupTransferSection canImport={data.canPublishTerms} />

      <section className="space-y-6" aria-labelledby="onboarding-screens-heading">
        <header className="max-w-3xl space-y-2">
          <h2 id="onboarding-screens-heading" className="text-xl font-semibold text-foreground">
            {t('builtinScreens.sectionTitle')}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('builtinScreens.sectionIntro')}
          </p>
        </header>
        <OnboardingScreensSection catalog={data.intakeCatalog} />
      </section>

      <section className="space-y-6" aria-labelledby="onboarding-questions-heading">
        <header className="max-w-3xl space-y-2">
          <h2 id="onboarding-questions-heading" className="text-xl font-semibold text-foreground">
            {t('tabQuestions')}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{t('questionsIntro')}</p>
        </header>
        <OnboardingQuestionsSection catalog={data.intakeCatalog} />
        <OnboardingDocumentSection explanation={data.documentExplanation} />
      </section>

      <section className="space-y-6" aria-labelledby="onboarding-terms-heading">
        <header className="max-w-3xl space-y-2">
          <h2 id="onboarding-terms-heading" className="text-xl font-semibold text-foreground">
            {t('appTerms.sectionTitle')}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{t('appTerms.sectionIntro')}</p>
        </header>
        <OnboardingAppTermsSection
          versions={data.termsVersions}
          canPublish={data.canPublishTerms}
        />
      </section>

      <section className="space-y-6" aria-labelledby="onboarding-authorization-heading">
        <header className="max-w-3xl space-y-2">
          <h2
            id="onboarding-authorization-heading"
            className="text-xl font-semibold text-foreground"
          >
            {t('tabAuthorization')}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">{t('authorizationIntro')}</p>
        </header>
        <OnboardingAuthorizationSection
          seasons={data.seasons}
          versions={data.versions}
          canPublish={data.canPublishTerms}
        />
      </section>
    </section>
  );
}
