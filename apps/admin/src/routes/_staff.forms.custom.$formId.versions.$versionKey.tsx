/**
 * One published version of a form, read-only (RAPP-924). The key is the
 * version's row id for the app's legal forms and its number for a team form
 * (`fetchPublishedFormVersion`). The same guard as the form's board.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { FormVersionPage } from '@/components/custom-forms/form-version-page';
import { loadCustomForm } from '@/lib/custom-forms';
import { CUSTOM_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { customFormById, fetchPublishedFormVersion } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/custom/$formId/versions/$versionKey')({
  ssr: false,
  loader: async ({ params }) => {
    const data = await loadCustomForm(params.formId);
    const form = customFormById(data.intakeCatalog, params.formId);
    const version =
      form === undefined
        ? null
        : await fetchPublishedFormVersion(supabase, form, params.versionKey);
    return { data, version };
  },
  component: FormVersionRoute,
});

function FormVersionRoute() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={CUSTOM_FORMS_PERMISSIONS}>
      <Version />
    </RequireAuth>
  );
}

function Version() {
  const { formId } = Route.useParams();
  const { data, version } = Route.useLoaderData();
  return <FormVersionPage data={data} formId={formId} version={version} />;
}
