import { EntityReferralDashboard } from '@/components/referrals/entity-referral-dashboard';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { fetchEntityReferrals } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_entity/portal/referrals/')({
  ssr: false,
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  loader: () => fetchEntityReferrals(supabase),
  component: ReferralsPage,
});

function ReferralsPage() {
  const navigate = Route.useNavigate();
  const { q } = Route.useSearch();
  return (
    <EntityReferralDashboard
      referrals={Route.useLoaderData()}
      search={q ?? ''}
      onSearchChange={(search) =>
        void navigate({ search: search.length === 0 ? {} : { q: search }, replace: true })
      }
    />
  );
}
