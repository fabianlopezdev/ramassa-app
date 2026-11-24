/**
 * Formularis › Formulari de suggeriments (RAPP-939): what a player fills in
 * when she sends the club a suggestion, built on a board of screens like
 * every form. The suggestions themselves are read in the inbox (/feedback),
 * which keeps its own permission.
 *
 * Staff who hold settings.organization or onboarding.design edit it; the
 * database checks every change again. It reads the dashboard's catalog, the
 * one that holds the form and its questions. `ssr: false` for the reason
 * every staff screen gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { FeedbackFormBoard } from '@/components/feedback/feedback-form-board';
import { Page, PageHeader } from '@/components/layout/page';
import { FEEDBACK_FORM_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchIntakeCatalogWithSurveys } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/feedback/')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalogWithSurveys(supabase) }),
  component: FeedbackFormPage,
});

function FeedbackFormPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={FEEDBACK_FORM_PERMISSIONS}>
      <FeedbackFormScreen />
    </RequireAuth>
  );
}

function FeedbackFormScreen() {
  const data = Route.useLoaderData();
  // Named as the menu names it.
  const { t } = useTranslation('nav');
  return (
    <Page data-testid="feedback-form-page">
      <PageHeader title={t('staff.feedbackForm')} />
      <FeedbackFormBoard catalog={data.intakeCatalog} />
    </Page>
  );
}
