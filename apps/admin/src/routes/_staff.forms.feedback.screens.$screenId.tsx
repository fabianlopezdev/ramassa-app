/**
 * One screen of the suggestions form (RAPP-939), opened from its card on the
 * board. The same guard as the board; the database checks every change
 * again. `ssr: false` for the reason every staff screen gives (the session
 * lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { FeedbackFormScreenEditor } from '@/components/feedback/feedback-form-screen';
import { FEEDBACK_FORM_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchIntakeCatalogWithSurveys } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/forms/feedback/screens/$screenId')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalogWithSurveys(supabase) }),
  component: FeedbackFormScreenRoute,
});

function FeedbackFormScreenRoute() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={FEEDBACK_FORM_PERMISSIONS}>
      <Screen />
    </RequireAuth>
  );
}

function Screen() {
  const { screenId } = Route.useParams();
  return (
    <FeedbackFormScreenEditor catalog={Route.useLoaderData().intakeCatalog} screenId={screenId} />
  );
}
