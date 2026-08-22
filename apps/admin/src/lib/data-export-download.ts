import { buildExportCsv, type DataExport } from '@ramassa/shared/data-exports';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadExportCsv(exportData: DataExport, filename: string) {
  saveBlob(
    new Blob([buildExportCsv(exportData)], { type: 'text/csv;charset=utf-8' }),
    `${filename}.csv`,
  );
}

export async function buildExportXlsx(exportData: DataExport): Promise<ArrayBuffer> {
  // Keep the 900 KB spreadsheet implementation out of the initial admin route.
  // It loads only after the user explicitly requests an XLSX file.
  const excel = await import('exceljs');
  const Workbook = excel.Workbook ?? excel.default.Workbook;
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(exportData.dataset.slice(0, 31));
  sheet.columns = exportData.columns.map((column) => ({ header: column, key: column }));
  for (const row of exportData.rows) sheet.addRow(row);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(exportData.columns.length).address };
  return workbook.xlsx.writeBuffer();
}

export async function downloadExportXlsx(exportData: DataExport, filename: string) {
  const bytes = await buildExportXlsx(exportData);
  saveBlob(
    new Blob([bytes as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${filename}.xlsx`,
  );
}
