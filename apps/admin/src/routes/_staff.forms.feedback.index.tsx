/**
 * Formularis › Formulari de suggeriments (RAPP-939): what a player fills in
 * when she sends the club a suggestion, built on the board the forms she
 * sends when she wants share (RAPP-940). The suggestions themselves are read
 * in the inbox (/feedback), which keeps its own permission.
 *
 * It reads the dashboard's catalog, the one that holds the form and its
 * questions. `ssr: false` for the reason every staff screen gives (the session
 * lives in localStorage, ADR-005).
 */

import { OnDemandFormBoardPage } from '@/components/custom-forms/on-demand-form-board';
import { FEEDBACK_FORM } from '@/lib/feedback-form';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchIntakeCatalogWithSurveys } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/feedback/')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalogWithSurveys(supabase) }),
  component: FeedbackFormPage,
});

function FeedbackFormPage() {
  return (
    <OnDemandFormBoardPage
      definition={FEEDBACK_FORM}
      catalog={Route.useLoaderData().intakeCatalog}
    />
  );
}
