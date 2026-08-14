import { ReferralDetail } from '@/components/referrals/referral-detail';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchReferral, fetchReferralUpdates } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_entity/portal/referrals/$referralId')({
  ssr: false,
  loader: async ({ params }) => {
    const [referral, updates] = await Promise.all([
      fetchReferral(supabase, params.referralId),
      fetchReferralUpdates(supabase, params.referralId),
    ]);
    return { referral, updates };
  },
  component: ReferralPage,
});

function ReferralPage() {
  const { referral, updates } = Route.useLoaderData();
  return <ReferralDetail referral={referral} initialUpdates={updates} />;
}
