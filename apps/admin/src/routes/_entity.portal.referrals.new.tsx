import { ReferralForm } from '@/components/referrals/referral-form';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchSupportingEntityNames } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_entity/portal/referrals/new')({
  ssr: false,
  // The partner entities offered as "other entities that support her" (RAPP-303).
  loader: async () => ({ entityNames: await fetchSupportingEntityNames(supabase) }),
  component: ReferralFormPage,
});

function ReferralFormPage() {
  const { entityNames } = Route.useLoaderData();
  return <ReferralForm entityNames={entityNames} />;
}
