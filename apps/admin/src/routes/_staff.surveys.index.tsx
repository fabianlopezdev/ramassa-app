/**
 * Enquestes (RAPP-929): the surveys, forms of the engine whose answers are
 * kept with each response and never on her record, with Nova enquesta. The
 * surveys made before stay in Enquestes anteriors (`/surveys/archive`).
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { CustomFormsList } from '@/components/custom-forms/custom-forms-list';
import { loadCustomForms } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/surveys/')({
  ssr: false,
  loader: loadCustomForms,
  component: SurveysPage,
});

function SurveysPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={CUSTOM_FORMS_PERMISSIONS}>
      <CustomFormsList data={Route.useLoaderData()} kind="survey" />
    </RequireAuth>
  );
}
