import { ReferralForm } from '@/components/referrals/referral-form';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { EMPTY_INTAKE_CATALOG, fetchIntakeCatalog } from '@ramassa/shared/intake-builder';
import { fetchSupportingEntityNames } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_entity/portal/referrals/new')({
  ssr: false,
  // The partner entities offered as "other entities that support her" (RAPP-303),
  // and the questions staff added to this form (RAPP-307).
  loader: async () => {
    const [entityNames, catalog] = await Promise.all([
      fetchSupportingEntityNames(supabase),
      fetchIntakeCatalog(supabase).catch(() => EMPTY_INTAKE_CATALOG),
    ]);
    return { entityNames, catalog };
  },
  component: ReferralFormPage,
});

function ReferralFormPage() {
  const { entityNames, catalog } = Route.useLoaderData();
  return <ReferralForm entityNames={entityNames} catalog={catalog} />;
}
