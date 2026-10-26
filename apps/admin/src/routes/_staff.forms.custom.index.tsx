/**
 * Formularis de l'equip (RAPP-700): the forms the team created, with Nou
 * formulari. The people who design Onboarding build them; the team who reads
 * the participants opens them to send them and see who answered.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { CustomFormsList } from '@/components/custom-forms/custom-forms-list';
import { loadCustomForms } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/custom/')({
  ssr: false,
  loader: loadCustomForms,
  component: CustomFormsPage,
});

function CustomFormsPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={CUSTOM_FORMS_PERMISSIONS}>
      <CustomFormsList data={Route.useLoaderData()} />
    </RequireAuth>
  );
}
