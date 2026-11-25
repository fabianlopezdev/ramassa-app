/**
 * Incidents (RAPP-973): the reports players send from Contacte, for
 * `incidents.manage` only. An anonymous report names nobody; the database
 * sends no id and no name for it. `ssr: false` for the reason every staff
 * screen gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { StaffIncidentQueue } from '@/components/incidents/staff-incident-queue';
import { INCIDENTS_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchStaffIncidentReports } from '@ramassa/shared/incidents';

export const Route = createFileRoute('/_staff/incidents')({
  ssr: false,
  loader: async ({ abortController }) => ({
    reports: await fetchStaffIncidentReports(supabase, abortController.signal),
  }),
  component: StaffIncidentsPage,
});

function StaffIncidentsPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={INCIDENTS_PERMISSIONS}>
      <StaffIncidentQueue reports={Route.useLoaderData().reports} />
    </RequireAuth>
  );
}
