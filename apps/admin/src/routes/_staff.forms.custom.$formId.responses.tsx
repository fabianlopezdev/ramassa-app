/**
 * A team form's Respostes on their own page (RAPP-919). The same guard and
 * loader as the form's board. `ssr: false` for the reason every staff screen
 * gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { CustomFormResponsesPage } from '@/components/custom-forms/form-responses';
import { loadCustomForm } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { customFormById, fetchSurveyResults } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/custom/$formId/responses')({
  ssr: false,
  loader: async ({ params }) => {
    const data = await loadCustomForm(params.formId);
    // A survey's answers, for its results (RAPP-929).
    const isSurvey = customFormById(data.intakeCatalog, params.formId)?.kind === 'survey';
    const surveyRows =
      isSurvey && data.canReadResponses ? await fetchSurveyResults(supabase, params.formId) : [];
    return { data, surveyRows };
  },
  component: CustomFormResponsesRoute,
});

function CustomFormResponsesRoute() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={CUSTOM_FORMS_PERMISSIONS}>
      <Responses />
    </RequireAuth>
  );
}

function Responses() {
  const { formId } = Route.useParams();
  const { data, surveyRows } = Route.useLoaderData();
  return <CustomFormResponsesPage data={data} formId={formId} surveyRows={surveyRows} />;
}
