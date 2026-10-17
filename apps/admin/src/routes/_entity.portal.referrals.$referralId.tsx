import { ReferralDetail } from '@/components/referrals/referral-detail';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  fetchReferralCustomAnswers,
} from '@ramassa/shared/intake-builder';
import { fetchReferral, fetchReferralUpdates } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_entity/portal/referrals/$referralId')({
  ssr: false,
  loader: async ({ params }) => {
    const [referral, updates, catalog, customAnswers] = await Promise.all([
      fetchReferral(supabase, params.referralId),
      fetchReferralUpdates(supabase, params.referralId),
      // The answers to the questions staff added (RAPP-307); the page works without them.
      fetchIntakeCatalog(supabase).catch(() => EMPTY_INTAKE_CATALOG),
      fetchReferralCustomAnswers(supabase, params.referralId).catch(() => ({})),
    ]);
    return { referral, updates, catalog, customAnswers };
  },
  component: ReferralPage,
});

function ReferralPage() {
  const { referral, updates, catalog, customAnswers } = Route.useLoaderData();
  return (
    <ReferralDetail
      referral={referral}
      initialUpdates={updates}
      custom={{ catalog, answers: customAnswers }}
    />
  );
}
