/**
 * Creating a participant's access (RAPP-25): the fork between "she has an
 * email" (record an invitation) and "she has none" (mint an internal account).
 *
 * No loader: the screen asks before it fetches, and both arms write through
 * SECURITY DEFINER RPCs that verify the staff role server-side. `ssr: false`
 * for the reason every staff screen gives (the session lives in localStorage,
 * ADR-005), and more so here: this page's success state holds a one-time
 * password, which has no business existing during a server render.
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
