/**
 * Inviting a participant (RAPP-25, RAPP-224): every player joins with her own
 * email, and the invitation creates her account.
 *
 * The loader only reads the optional referral the invitation answers. The
 * write goes through a SECURITY DEFINER RPC that verifies the staff role
 * server-side. `ssr: false` for the reason every staff screen gives (the
 * session lives in localStorage, ADR-005).
 */

import { NewParticipant } from '@/components/participants/new-participant';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { fetchReferral } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_staff/participants/new')({
  ssr: false,
  validateSearch: z.object({
    referral: z.uuid().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    deps.referral === undefined ? Promise.resolve(null) : fetchReferral(supabase, deps.referral),
  component: NewParticipantPage,
});

function NewParticipantPage() {
  return <NewParticipant referral={Route.useLoaderData()} />;
}
