/**
 * The incidents players report, on the staff phone (RAPP-973), for
 * `incidents.manage` holders, as on the dashboard: every report with what,
 * when and where and her answers, and closing it or opening it again. An
 * anonymous report names nobody. Kept in memory: the reports are private and
 * never cached on the disk.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  fetchStaffIncidentReports,
  setIncidentReportStatus,
  type IncidentStatus,
} from '@ramassa/shared/incidents';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';

const incidentsRoot = (userId: string) => ['team', userId, 'incidents'] as const;

export function useStaffIncidentReports() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...incidentsRoot(user?.id ?? SIGNED_OUT), 'reports'],
    queryFn: ({ signal }) => fetchStaffIncidentReports(supabase, signal),
    enabled: user !== null,
  });
}

/** Closes a report, or opens it again, then reads the reports again. */
export function useIncidentStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly reportId: string; readonly status: IncidentStatus }) =>
      setIncidentReportStatus(supabase, input.reportId, input.status),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: incidentsRoot(user?.id ?? SIGNED_OUT) }),
  });
}
