/**
 * The invitations list (RAPP-25), reached from the roster.
 *
 * `ssr: false` for the standard reason (the session lives in localStorage,
 * ADR-005): a server-rendered loader would query as an anonymous user, RLS
 * would correctly return nothing, and the screen would confidently claim no
 * invitation was ever sent.
 */

import { InvitesTable } from '@/components/participants/invites-table';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchInvites } from '@ramassa/shared/accounts';

export const Route = createFileRoute('/_staff/participants/invites')({
  ssr: false,
  loader: async () => ({ invites: await fetchInvites(supabase) }),
  component: InvitesPage,
});

function InvitesPage() {
  const { invites } = Route.useLoaderData();
  return <InvitesTable invites={invites} />;
}
