/**
 * The season authorization's overview (RAPP-927): its seasons, the version
 * each one signs and the next season to prepare. Its board is the form's page
 * (`/forms/custom/$formId`), opened from Edita. Before the form exists,
 * Condicions legals. `ssr: false` for the reason every staff screen gives
 * (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { AuthorizationOverview } from '@/components/custom-forms/authorization-overview';
import { fetchSystemFormId, loadCustomForm } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/authorization/')({
  ssr: false,
  loader: async () => {
    const formId = await fetchSystemFormId('season_authorization');
    if (formId === null) throw redirect({ to: '/forms/legal', replace: true });
    return { formId, data: await loadCustomForm(formId) };
  },
  component: AuthorizationRoute,
});

function AuthorizationRoute() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={CUSTOM_FORMS_PERMISSIONS}>
      <Overview />
    </RequireAuth>
  );
}

function Overview() {
  const { formId, data } = Route.useLoaderData();
  return <AuthorizationOverview data={data} formId={formId} />;
}
