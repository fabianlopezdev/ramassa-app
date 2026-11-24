/**
 * One screen of the referral form (RAPP-938), opened from its card on the
 * board. The same guard as the board; the database checks every change
 * again. `ssr: false` for the reason every staff screen gives (the session
 * lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { ReferralFormScreenEditor } from '@/components/referrals/referral-form-screen';
import { REFERRAL_FORM_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/entities/referral-form/screens/$screenId')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalog(supabase) }),
  component: ReferralFormScreenRoute,
});

function ReferralFormScreenRoute() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={REFERRAL_FORM_PERMISSIONS}>
      <Screen />
    </RequireAuth>
  );
}

function Screen() {
  const { screenId } = Route.useParams();
  return (
    <ReferralFormScreenEditor catalog={Route.useLoaderData().intakeCatalog} screenId={screenId} />
  );
}
