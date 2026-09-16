import ExcelJS from 'exceljs';

export const EXPORT_ROWS_PER_PAGE = 15;
const DATA_ROW_HEIGHT = 22;
const HEADER_ROW_HEIGHT = 24;

type RowBreak = { id: number; max: number; min: number; man: boolean };

/** Print layout: taller rows and 15 data rows per printed page. */
export function applyReadablePrintLayout(
  sheet: ExcelJS.Worksheet,
  rowsPerPage = EXPORT_ROWS_PER_PAGE,
): void {
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    horizontalCentered: true,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.25,
      footer: 0.25,
    },
  };

  const headerRow = sheet.getRow(1);
  headerRow.height = HEADER_ROW_HEIGHT;
  headerRow.alignment = { ...(headerRow.alignment ?? {}), vertical: 'middle', wrapText: false, shrinkToFit: true };

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    row.height = DATA_ROW_HEIGHT;
    row.alignment = { ...(row.alignment ?? {}), vertical: 'middle', wrapText: false };
  }

  const breaks: RowBreak[] = [];
  for (let row = 1 + rowsPerPage; row < sheet.rowCount; row += rowsPerPage) {
    breaks.push({ id: row, max: 16383, min: 0, man: true });
  }
  (sheet as ExcelJS.Worksheet & { rowBreaks: RowBreak[] }).rowBreaks = breaks;
}

/** Build an .xlsx buffer from a header row + data rows. */
export async function buildExcelBuffer(
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Signet Workforce ERP';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.commit();

  for (const row of rows) {
    sheet.addRow(row.map((cell) => (cell == null ? '' : cell)));
  }

  headers.forEach((_, index) => {
    const column = sheet.getColumn(index + 1);
    let max = headers[index]?.length ?? 10;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = len;
    });
    column.width = Math.min(Math.max(max + 3, 16), 48);
  });

  applyReadablePrintLayout(sheet);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
