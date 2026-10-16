/**
 * The impact report on the phone (RAPP-400), for `impact.view` holders, as
 * the web admin's dashboard: `get_impact_report` for a period and, if
 * chosen, one event category or one collaborating entity. The report holds
 * only counts, and groups too small to count are suppressed by the database.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchImpactReport, type ImpactReportFilters } from '@ramassa/shared/analytics';
import { useAuth } from '@ramassa/shared/auth';
import { supabase } from './supabase';

export function useImpactReport(filters: ImpactReportFilters) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['team', user?.id ?? 'signed-out', 'impact', filters],
    queryFn: () => fetchImpactReport(supabase, filters),
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });
}
