import { applyReadablePrintLayout } from '../utils/excel-export';
import ExcelJS from 'exceljs';

describe('excel export print layout', () => {
  it('uses 15 data rows per printed page and taller row heights', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Test');
    sheet.addRow(['Name', 'No']);
    for (let i = 1; i <= 20; i++) {
      sheet.addRow([`Emp ${i}`, i]);
    }

    applyReadablePrintLayout(sheet);

    expect(sheet.getRow(1).height).toBe(24);
    expect(sheet.getRow(2).height).toBe(22);
    expect(sheet.pageSetup.orientation).toBe('landscape');
    expect(sheet.pageSetup.paperSize).toBe(9);

    const breaks = (sheet as ExcelJS.Worksheet & { rowBreaks?: Array<{ id: number }> }).rowBreaks ?? [];
    expect(breaks.some((item) => item.id === 16)).toBe(true);
  });
});
