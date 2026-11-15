/**
 * One form the team created (RAPP-700): its board of screens, its settings
 * and its responses. The same guard as the list. `ssr: false` for the reason
 * every staff screen gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { CustomFormPage } from '@/components/custom-forms/custom-form-page';
import { loadCustomForm } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/custom/$formId/')({
  ssr: false,
  loader: ({ params }) => loadCustomForm(params.formId),
  component: CustomFormRoute,
});

function CustomFormRoute() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={CUSTOM_FORMS_PERMISSIONS}>
      <Form />
    </RequireAuth>
  );
}

function Form() {
  const { formId } = Route.useParams();
  return <CustomFormPage data={Route.useLoaderData()} formId={formId} />;
}
