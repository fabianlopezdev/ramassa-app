/**
 * Formularis › Formulari d'incidents (RAPP-973): what a player fills in when
 * she reports an incident, built on the board the forms she sends when she
 * wants share. The reports themselves are read on Incidents (/incidents),
 * which keeps its own permission.
 *
 * It reads the dashboard's catalog, the one that holds the form and its
 * questions. `ssr: false` for the reason every staff screen gives (the session
 * lives in localStorage, ADR-005).
 */

import { OnDemandFormBoardPage } from '@/components/custom-forms/on-demand-form-board';
import { INCIDENT_FORM } from '@/lib/incident-form';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchIntakeCatalogWithSurveys } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/incidents/')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalogWithSurveys(supabase) }),
  component: IncidentFormPage,
});

function IncidentFormPage() {
  return (
    <OnDemandFormBoardPage
      definition={INCIDENT_FORM}
      catalog={Route.useLoaderData().intakeCatalog}
    />
  );
}
