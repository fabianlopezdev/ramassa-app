/**
 * Her incident reports (RAPP-973): the ones she sent, the form she walks to
 * send a new one, and sending it. The form never comes in the catalog every
 * build reads: `my_incident_form` sends it, and `incidentFormCatalog` lays it
 * over that catalog with what, when and where first on its fixed screen, so
 * the form walker draws it as it draws any form.
 */

import { isNetworkStateOnline } from '@/lib/network-status';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  fetchMyIncidentFormSource,
  fetchOwnIncidentReports,
  incidentReportFromWalk,
  incidentReportSchema,
  sendIncidentReport,
} from '@ramassa/shared/incidents';

const PLAYER_INCIDENTS_QUERY_ROOT = 'player-incidents';
const SIGNED_OUT = 'signed-out';

/** The reports she sent, newest first. */
export function usePlayerIncidentReports() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [PLAYER_INCIDENTS_QUERY_ROOT, user?.id ?? SIGNED_OUT, 'reports'],
    queryFn: ({ signal }) => fetchOwnIncidentReports(supabase, signal),
    enabled: user !== null,
  });
}

/** The form as she fills it in now, with the catalog as sent; read again whenever it is opened. */
export function useIncidentFormSource() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [PLAYER_INCIDENTS_QUERY_ROOT, user?.id ?? SIGNED_OUT, 'form'],
    queryFn: () => fetchMyIncidentFormSource(supabase),
    enabled: user !== null,
    staleTime: 0,
  });
}

/**
 * Sends a report from what she gave on the walk and the anonymous switch,
 * then reads her reports again. The failure's code, else null.
 */
export function useSendIncidentReport() {
  const { user } = useAuth();
  const isOnline = isNetworkStateOnline(useNetworkState());
  const queryClient = useQueryClient();
  return async (
    answers: Readonly<Record<string, unknown>>,
    isAnonymous: boolean,
  ): Promise<AppErrorCode | null> => {
    if (!isOnline) return 'NETWORK-1';
    const walked = incidentReportFromWalk(answers, isAnonymous);
    if (!incidentReportSchema.safeParse(walked.report).success) return 'VALIDATION-1';
    const result = await safeAsync(
      () => sendIncidentReport(supabase, walked.report, walked.answers),
      { code: 'DB-1' },
    );
    if (!result.ok) return result.error.code;
    await queryClient.invalidateQueries({
      queryKey: [PLAYER_INCIDENTS_QUERY_ROOT, user?.id ?? SIGNED_OUT],
    });
    return null;
  };
}
