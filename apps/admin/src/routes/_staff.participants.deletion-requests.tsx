/**
 * The open erasure requests (RAPP-22 raised them, RAPP-26 works them).
 *
 * `ssr: false` for the standard reason (the session lives in localStorage,
 * ADR-005): a server-rendered loader queries as an anonymous user, RLS correctly
 * returns nothing, and the screen would claim confidently that nobody has asked
 * to be erased.
 */

import { DeletionRequestsTable } from '@/components/participants/deletion-requests-table';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchDeletionRequests } from '@ramassa/shared/rgpd';

export const Route = createFileRoute('/_staff/participants/deletion-requests')({
  ssr: false,
  loader: async () => ({ requests: await fetchDeletionRequests(supabase, 'open') }),
  component: DeletionRequestsPage,
});

function DeletionRequestsPage() {
  const { requests } = Route.useLoaderData();
  return <DeletionRequestsTable requests={requests} />;
}
