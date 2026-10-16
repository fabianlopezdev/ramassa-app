/**
 * Data exports and the audit log on the phone (RAPP-401), as the web admin's
 * Data page. An export asks for the step-up first, because the database
 * refuses it without a second factor from the last 10 minutes; the database
 * also checks the permission for the dataset, limits the rate and writes the
 * audit row. The rows become a CSV, which goes to the system share sheet and
 * is deleted from the phone afterwards. The audit log loads a page at a time.
 * Kept in memory: exports and audit entries name people.
 */
import { useStepUp } from '@/components/auth/step-up';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@ramassa/shared/auth';
import {
  buildExportCsv,
  createDataExport,
  fetchAuditLogPage,
  type AuditLogFilters,
  type DataExport,
  type DataExportRequest,
} from '@ramassa/shared/data-exports';
import { shareFile } from './share-file';
import { supabase } from './supabase';

const SIGNED_OUT = 'signed-out';
const AUDIT_PAGE_SIZE = 25;

const dataRoot = (userId: string) => ['team', userId, 'data'] as const;

/** `ramassa-participants-default-2026-10-15.csv`, as the web admin names it. */
function exportFileName(exportData: Pick<DataExport, 'dataset' | 'scope' | 'generated_at'>) {
  return `ramassa-${exportData.dataset}-${exportData.scope}-${exportData.generated_at.slice(0, 10)}.csv`;
}

export function useDataExport(dialogTitle: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const withStepUp = useStepUp();
  return useMutation({
    mutationFn: async (request: Omit<DataExportRequest, 'format'>) => {
      const exportData = await withStepUp(() =>
        createDataExport(supabase, { ...request, format: 'csv' }),
      );
      await shareFile({
        name: exportFileName(exportData),
        content: buildExportCsv(exportData),
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
        dialogTitle,
      });
      return exportData.rows.length;
    },
    // The export is in the audit log now.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...dataRoot(user?.id ?? SIGNED_OUT), 'audit'] }),
  });
}

export function useAuditLog(
  filters: Omit<AuditLogFilters, 'cursorCreatedAt' | 'cursorId' | 'pageSize'>,
  enabled: boolean,
) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: [...dataRoot(user?.id ?? SIGNED_OUT), 'audit', filters],
    queryFn: ({ pageParam }) =>
      fetchAuditLogPage(supabase, {
        ...filters,
        ...(pageParam === null
          ? {}
          : { cursorCreatedAt: pageParam.createdAt, cursorId: pageParam.id }),
        pageSize: AUDIT_PAGE_SIZE,
      }),
    initialPageParam: null as { readonly createdAt: string; readonly id: string } | null,
    getNextPageParam: (last) =>
      last.has_more && last.next_cursor_created_at !== null && last.next_cursor_id !== null
        ? { createdAt: last.next_cursor_created_at, id: last.next_cursor_id }
        : undefined,
    enabled: user !== null && enabled,
    placeholderData: keepPreviousData,
  });
}
