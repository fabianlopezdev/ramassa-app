import { describe, expect, test } from 'bun:test';
import ExcelJS from 'exceljs';
import { dataExportResponseSchema, type DataExport } from '@ramassa/shared/data-exports';
import { buildExportXlsx } from './data-export-download';

const { Workbook } = ExcelJS;

function exportFixture(scope: 'default' | 'full'): DataExport {
  return dataExportResponseSchema.parse({
    version: 1,
    export_id:
      scope === 'default'
        ? '63000000-0000-4000-8100-000000000091'
        : '63000000-0000-4000-8100-000000000092',
    dataset: 'participants',
    scope,
    format: 'xlsx',
    generated_at: '2026-08-22T12:00:00Z',
    columns:
      scope === 'default'
        ? ['first_name', 'last_name']
        : ['first_name', 'last_name', 'document_number'],
    rows: [
      scope === 'default'
        ? { first_name: 'أمينة', last_name: 'Torelló' }
        : { first_name: 'أمينة', last_name: 'Torelló', document_number: 'X1234567L' },
    ],
  });
}

describe('Excel export round trip', () => {
  test.each(['default', 'full'] as const)(
    '%s workbook preserves Arabic and Catalan',
    async (scope) => {
      const bytes = await buildExportXlsx(exportFixture(scope));
      const workbook = new Workbook();
      await workbook.xlsx.load(bytes);
      const sheet = workbook.getWorksheet('participants');

      expect(sheet?.getRow(2).getCell(1).value).toBe('أمينة');
      expect(sheet?.getRow(2).getCell(2).value).toBe('Torelló');
      expect(sheet?.autoFilter).toBeDefined();
      if (scope === 'full') expect(sheet?.getRow(2).getCell(3).value).toBe('X1234567L');
    },
  );
});
