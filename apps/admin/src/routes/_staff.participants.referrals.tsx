import { StaffReferralQueue } from '@/components/referrals/staff-referral-queue';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchStaffReferrals } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_staff/participants/referrals')({
  ssr: false,
  loader: () => fetchStaffReferrals(supabase, 'pending'),
  component: StaffReferralsPage,
});

function StaffReferralsPage() {
  return <StaffReferralQueue referrals={Route.useLoaderData()} />;
}
