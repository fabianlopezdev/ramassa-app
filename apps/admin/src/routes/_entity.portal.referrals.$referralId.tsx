import { ReferralDetail } from '@/components/referrals/referral-detail';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  EMPTY_INTAKE_CATALOG,
  fetchIntakeCatalog,
  systemFieldsOf,
} from '@ramassa/shared/intake-builder';
import { fetchReferralRecord, fetchReferralUpdates } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_entity/portal/referrals/$referralId')({
  ssr: false,
  loader: async ({ params }) => {
    // The Fitxa layout reads the entity's answers by field (RAPP-664); read once.
    const catalogRead = fetchIntakeCatalog(supabase).catch(() => EMPTY_INTAKE_CATALOG);
    const [referral, updates, catalog] = await Promise.all([
      fetchReferralRecord(supabase, params.referralId, catalogRead.then(systemFieldsOf)),
      fetchReferralUpdates(supabase, params.referralId),
      catalogRead,
    ]);
    return { referral, updates, catalog };
  },
  component: ReferralPage,
});

function ReferralPage() {
  const { referral, updates, catalog } = Route.useLoaderData();
  return <ReferralDetail referral={referral} initialUpdates={updates} catalog={catalog} />;
}
