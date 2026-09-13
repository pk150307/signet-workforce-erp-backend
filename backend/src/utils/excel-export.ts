import ExcelJS from 'exceljs';

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
    column.width = Math.min(Math.max(max + 2, 12), 40);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
