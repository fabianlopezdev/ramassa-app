/**
 * One screen of the mentoring form (RAPP-940), opened from its card on the
 * board, in the screen page the forms she sends when she wants share.
 * The same guard as the board; the database checks every change
 * again. `ssr: false` for the reason every staff screen gives (the session
 * lives in localStorage, ADR-005).
 */

import { OnDemandFormScreenPage } from '@/components/custom-forms/on-demand-form-screen';
import { MENTORING_FORM } from '@/lib/mentoring-form';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchIntakeCatalogWithSurveys } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/mentoring/screens/$screenId')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalogWithSurveys(supabase) }),
  component: MentoringFormScreenRoute,
});

function MentoringFormScreenRoute() {
  return (
    <OnDemandFormScreenPage
      definition={MENTORING_FORM}
      catalog={Route.useLoaderData().intakeCatalog}
      screenId={Route.useParams().screenId}
    />
  );
}
