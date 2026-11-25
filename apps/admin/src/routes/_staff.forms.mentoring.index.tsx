/**
 * Formularis › Formulari de mentoria (RAPP-940): what a player fills in
 * when she asks the club for mentoring, built on the board the forms she
 * sends when she wants share. The requests themselves are read in the queue
 * (/mentoring), which keeps its own permission.
 *
 * It reads the dashboard's catalog, the one that holds the form and its
 * questions. `ssr: false` for the reason every staff screen gives (the session
 * lives in localStorage, ADR-005).
 */

import { OnDemandFormBoardPage } from '@/components/custom-forms/on-demand-form-board';
import { MENTORING_FORM } from '@/lib/mentoring-form';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchIntakeCatalogWithSurveys } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/mentoring/')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalogWithSurveys(supabase) }),
  component: MentoringFormPage,
});

function MentoringFormPage() {
  return (
    <OnDemandFormBoardPage
      definition={MENTORING_FORM}
      catalog={Route.useLoaderData().intakeCatalog}
    />
  );
}
