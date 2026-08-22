import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import type { Database } from './types/database';

export const DATA_EXPORT_DATASETS = ['participants', 'attendance', 'events'] as const;
export const DATA_EXPORT_SCOPES = ['default', 'full'] as const;
export const DATA_EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export const SENSITIVE_EXPORT_COLUMNS = [
  'address',
  'postal_code',
  'phone',
  'document_number',
] as const;

const exportCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const dataExportResponseSchema = z
  .object({
    version: z.literal(1),
    export_id: z.uuid(),
    dataset: z.enum(DATA_EXPORT_DATASETS),
    scope: z.enum(DATA_EXPORT_SCOPES),
    format: z.enum(DATA_EXPORT_FORMATS),
    generated_at: z.iso.datetime({ offset: true }),
    columns: z.array(z.string().min(1)).min(1),
    rows: z.array(z.record(z.string(), exportCellSchema)),
  })
  .superRefine((exportData, context) => {
    if (
      exportData.scope === 'default' &&
      exportData.columns.some((column) =>
        (SENSITIVE_EXPORT_COLUMNS as readonly string[]).includes(column),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['columns'],
        message: 'Default exports cannot contain sensitive columns',
      });
    }
    for (const [rowIndex, row] of exportData.rows.entries()) {
      const unexpected = Object.keys(row).find((key) => !exportData.columns.includes(key));
      if (unexpected !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['rows', rowIndex, unexpected],
          message: 'Export row contains an undeclared column',
        });
      }
    }
  });

export type DataExport = z.infer<typeof dataExportResponseSchema>;

export const dataExportRequestSchema = z
  .object({
    dataset: z.enum(DATA_EXPORT_DATASETS),
    scope: z.enum(DATA_EXPORT_SCOPES),
    format: z.enum(DATA_EXPORT_FORMATS),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    reason: z.string().trim().max(500).optional(),
    confirmed: z.boolean().default(false),
  })
  .superRefine((request, context) => {
    if (
      request.startDate !== undefined &&
      request.endDate !== undefined &&
      request.startDate > request.endDate
    ) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'Invalid export period' });
    }
    if (request.scope === 'full' && request.confirmed !== true) {
      context.addIssue({
        code: 'custom',
        path: ['confirmed'],
        message: 'Confirmation is required',
      });
    }
    if (request.scope === 'full' && (request.reason?.trim().length ?? 0) < 10) {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required' });
    }
  });

export type DataExportRequest = z.input<typeof dataExportRequestSchema>;

function spreadsheetSafe(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown): string {
  const text = spreadsheetSafe(value === null || value === undefined ? '' : String(value));
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildExportCsv(exportData: DataExport): string {
  const rows = [
    exportData.columns,
    ...exportData.rows.map((row) => exportData.columns.map((column) => row[column] ?? '')),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

type Client = SupabaseClient<Database>;
type RpcClient = Pick<Client, 'rpc'>;
type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function createDataExport(
  client: RpcClient,
  input: DataExportRequest,
): Promise<DataExport> {
  const request = dataExportRequestSchema.parse(input);
  const rpc = client.rpc.bind(client) as unknown as UntypedRpc;
  const { data, error } = await rpc('create_data_export', {
    p_dataset: request.dataset,
    p_scope: request.scope,
    p_format: request.format,
    p_start_date: request.startDate ?? null,
    p_end_date: request.endDate ?? null,
    p_reason: request.reason ?? null,
    p_confirmed: request.confirmed,
  });
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return dataExportResponseSchema.parse(data);
}

export const auditLogFiltersSchema = z
  .object({
    actorId: z.uuid().optional(),
    action: z.string().trim().min(1).max(120).optional(),
    targetType: z.string().trim().min(1).max(120).optional(),
    targetId: z.uuid().optional(),
    startDate: z.iso.date().optional(),
    endDate: z.iso.date().optional(),
    cursorCreatedAt: z.iso.datetime({ offset: true }).optional(),
    cursorId: z.uuid().optional(),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .superRefine((filters, context) => {
    if (
      filters.startDate !== undefined &&
      filters.endDate !== undefined &&
      filters.startDate > filters.endDate
    ) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'Invalid audit period' });
    }
    if ((filters.cursorCreatedAt === undefined) !== (filters.cursorId === undefined)) {
      context.addIssue({ code: 'custom', path: ['cursorId'], message: 'Incomplete cursor' });
    }
  });

export type AuditLogFilters = z.input<typeof auditLogFiltersSchema>;

const auditLogPageSchema = z.object({
  rows: z.array(
    z.object({
      id: z.uuid(),
      actor_id: z.uuid(),
      actor_name: z.string(),
      action: z.string(),
      target_type: z.string(),
      target_id: z.uuid(),
      changes: z.record(z.string(), z.unknown()).nullable(),
      created_at: z.iso.datetime({ offset: true }),
    }),
  ),
  has_more: z.boolean(),
  next_cursor_created_at: z.iso.datetime({ offset: true }).nullable(),
  next_cursor_id: z.uuid().nullable(),
});

export type AuditLogPage = z.infer<typeof auditLogPageSchema>;

export async function fetchAuditLogPage(
  client: RpcClient,
  input: AuditLogFilters = {},
): Promise<AuditLogPage> {
  const filters = auditLogFiltersSchema.parse(input);
  const rpc = client.rpc.bind(client) as unknown as UntypedRpc;
  const { data, error } = await rpc('get_audit_log_page', {
    p_actor_id: filters.actorId ?? null,
    p_action: filters.action ?? null,
    p_target_type: filters.targetType ?? null,
    p_target_id: filters.targetId ?? null,
    p_start_date: filters.startDate ?? null,
    p_end_date: filters.endDate ?? null,
    p_cursor_created_at: filters.cursorCreatedAt ?? null,
    p_cursor_id: filters.cursorId ?? null,
    p_page_size: filters.pageSize,
  });
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return auditLogPageSchema.parse(data);
}
