/**
 * One screen of a form the team created (RAPP-700), opened from its card. Its
 * designers edit it: settings.organization or onboarding.design, the same
 * permissions the database checks. `ssr: false` for the reason every staff
 * screen gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { CustomFormScreenEditor } from '@/components/custom-forms/custom-form-screen';
import { loadCustomForm } from '@/lib/custom-forms';
import { ONBOARDING_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/custom/$formId/screens/$screenId')({
  ssr: false,
  loader: ({ params }) => loadCustomForm(params.formId),
  component: CustomFormScreenRoute,
});

function CustomFormScreenRoute() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={ONBOARDING_PERMISSIONS}>
      <Screen />
    </RequireAuth>
  );
}

function Screen() {
  const { formId, screenId } = Route.useParams();
  return (
    <CustomFormScreenEditor data={Route.useLoaderData()} formId={formId} screenId={screenId} />
  );
}
