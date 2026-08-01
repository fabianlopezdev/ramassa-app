/**
 * The staff roster (RAPP-23): search, filters, sort and paging over every
 * participant in the organization.
 *
 * ALL of that state lives in the URL. A staff member who filters to "referred
 * by Creu Roja, inactive" can send that link to a colleague, bookmark it, or
 * reload without losing it, and the back button does what she expects. It also
 * means the loader is a pure function of the URL, with no second copy of the
 * state to disagree with the address bar.
 *
 * The data is fetched in the ROUTE LOADER, keyed on the search params, rather
 * than in a component effect: the query starts while the route resolves instead
 * of after the first paint.
 *
 * Search, filters, sort and paging all happen in the DATABASE (the query layer
 * this issue added). Fetching the organization and slicing it here would work
 * on twenty seeded participants and fall over at the two hundred this roster is
 * meant to reach.
 */

import { ParticipantsTable } from '@/components/participants/participants-table';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  fetchParticipantFilterOptions,
  fetchParticipants,
  participantSearchSchema,
} from '@ramassa/shared/participants';

export const Route = createFileRoute('/_staff/participants/')({
  // Client-only, because the SESSION is. Supabase keeps it in localStorage
  // (ADR-005), so a loader running during the server render queries as an
  // anonymous user, RLS correctly refuses, and the screen renders a confident
  // "0 participants" over a roster of twenty. `ssr: false` moves the loader to
  // the browser, where the caller is who the table says she is.
  ssr: false,
  // The schema itself, handed straight to the router. Every field carries a
  // `.catch()` and a `.default()`, which does two jobs: a hand-edited or stale
  // URL renders the table with that one filter ignored instead of an error
  // page, and a link to this route (the detail view's "back to the list") does
  // not have to spell out all eight parameters to satisfy the type checker.
  validateSearch: participantSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, filterOptions] = await Promise.all([
      fetchParticipants(supabase, deps),
      fetchParticipantFilterOptions(supabase),
    ]);
    return { page, filterOptions };
  },
  component: ParticipantsPage,
});

function ParticipantsPage() {
  const { page, filterOptions } = Route.useLoaderData();
  const search = Route.useSearch();

  return <ParticipantsTable page={page} filterOptions={filterOptions} search={search} />;
}
