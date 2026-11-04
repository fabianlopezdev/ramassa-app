/**
 * Condicions legals (RAPP-771): the app's two legal forms and every legal
 * form the team created, with Nou formulari. The same page as Altres
 * formularis and the same people: the people who design Onboarding build
 * them, the team who reads the participants sees who answered.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { CustomFormsList } from '@/components/custom-forms/custom-forms-list';
import { loadCustomForms } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/legal/')({
  ssr: false,
  loader: loadCustomForms,
  component: LegalFormsPage,
});

function LegalFormsPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={CUSTOM_FORMS_PERMISSIONS}>
      <CustomFormsList data={Route.useLoaderData()} kind="legal" />
    </RequireAuth>
  );
}
