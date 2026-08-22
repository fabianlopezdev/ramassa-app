import { describe, expect, test } from 'bun:test';
import {
  buildExportCsv,
  createDataExport,
  dataExportResponseSchema,
  fetchAuditLogPage,
} from './data-exports';

const PARTICIPANT_EXPORT = {
  version: 1,
  export_id: '63000000-0000-4000-8100-000000000099',
  dataset: 'participants',
  scope: 'default',
  format: 'csv',
  generated_at: '2026-08-22T12:00:00Z',
  columns: ['first_name', 'last_name', 'city'],
  rows: [{ first_name: 'أمينة', last_name: 'Torelló', city: '=Granollers' }],
} as const;

describe('data export contract', () => {
  test('parses a typed export and rejects a default export that leaks a sensitive column', () => {
    expect(dataExportResponseSchema.parse(PARTICIPANT_EXPORT).rows[0]?.first_name).toBe('أمينة');
    expect(() =>
      dataExportResponseSchema.parse({
        ...PARTICIPANT_EXPORT,
        columns: [...PARTICIPANT_EXPORT.columns, 'document_number'],
      }),
    ).toThrow();
  });

  test('builds UTF-8 BOM CSV with Arabic, Catalan accents, and spreadsheet-formula neutralization', () => {
    const csv = buildExportCsv(dataExportResponseSchema.parse(PARTICIPANT_EXPORT));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('أمينة');
    expect(csv).toContain('Torelló');
    expect(csv).toContain("'=Granollers");
    expect(new TextDecoder().decode(new TextEncoder().encode(csv))).toBe(
      csv.replace(/^\uFEFF/, ''),
    );
  });

  test('sends confirmation and reason only through the audited export RPC', async () => {
    let call: { name: string; args: unknown } | undefined;
    const rpc = async (name: string, args: unknown) => {
      call = { name, args };
      return { data: { ...PARTICIPANT_EXPORT, scope: 'full', format: 'xlsx' }, error: null };
    };

    await createDataExport({ rpc } as never, {
      dataset: 'participants',
      scope: 'full',
      format: 'xlsx',
      reason: 'Participant access request',
      confirmed: true,
    });

    expect(call).toEqual({
      name: 'create_data_export',
      args: {
        p_dataset: 'participants',
        p_scope: 'full',
        p_format: 'xlsx',
        p_start_date: null,
        p_end_date: null,
        p_reason: 'Participant access request',
        p_confirmed: true,
      },
    });
  });
});

test('audit viewer sends typed filters and cursor pagination to its RPC', async () => {
  let args: unknown;
  const rpc = async (_name: string, next: unknown) => {
    args = next;
    return {
      data: {
        rows: [],
        has_more: false,
        next_cursor_created_at: null,
        next_cursor_id: null,
      },
      error: null,
    };
  };

  await fetchAuditLogPage({ rpc } as never, {
    action: 'data_export.full',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
  });

  expect(args).toEqual({
    p_actor_id: null,
    p_action: 'data_export.full',
    p_target_type: null,
    p_target_id: null,
    p_start_date: '2026-08-01',
    p_end_date: '2026-08-31',
    p_cursor_created_at: null,
    p_cursor_id: null,
    p_page_size: 50,
  });
});
