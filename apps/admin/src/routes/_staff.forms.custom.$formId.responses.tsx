/**
 * A team form's Respostes on their own page (RAPP-919). The same guard and
 * loader as the form's board. `ssr: false` for the reason every staff screen
 * gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { CustomFormResponsesPage } from '@/components/custom-forms/form-responses';
import { loadCustomForm } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/custom/$formId/responses')({
  ssr: false,
  loader: ({ params }) => loadCustomForm(params.formId),
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
  return <CustomFormResponsesPage data={Route.useLoaderData()} formId={formId} />;
}
