import ExcelJS from 'exceljs';
import { statusShortCode } from './attendance.utils';
import { parseStatusInput } from './attendance.utils';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LOOKUP: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

export const EMP_ID_HEADER = 'Emp ID';
export const EMP_NAME_HEADER = 'Emp Name';
export const OT_HOURS_HEADER = 'OT Hours';
export const NIGHT_ALLOWANCE_HEADER = 'Night Allowance';
export const PUNCTUALITY_AWARD_HEADER = 'Punctuality Award';

type TailColumnType = 'ot' | 'night' | 'punctuality';

export function isOvertimeHeader(header: string): boolean {
  const key = String(header ?? '').trim().toLowerCase();
  return key === 'ot hours' || key === 'overtime' || key === 'ot' || key === 'overtime hours';
}

export function isNightAllowanceHeader(header: string): boolean {
  const key = String(header ?? '').trim().toLowerCase();
  return key === 'night allowance' || key === 'night' || key === 'na';
}

export function isPunctualityAwardHeader(header: string): boolean {
  const key = String(header ?? '').trim().toLowerCase();
  return key === 'punctuality award' || key === 'punctuality' || key === 'pa';
}

function resolveTailColumn(header: string): TailColumnType | null {
  if (isOvertimeHeader(header)) return 'ot';
  if (isNightAllowanceHeader(header)) return 'night';
  if (isPunctualityAwardHeader(header)) return 'punctuality';
  return null;
}

export function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const mon = MONTH_LABELS[month - 1] ?? 'Jan';
  const yy = String(year).slice(-2);
  return `${String(day).padStart(2, '0')}-${mon}-${yy}`;
}

export function parseHeaderDate(header: string, expectedMonth: number, expectedYear: number): string | null {
  const trimmed = String(header ?? '').trim().replace(/\s*\([^)]*\)\s*$/i, '');
  const match = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = MONTH_LOOKUP[match[2].toUpperCase()];
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000;

  if (!month || day < 1 || day > 31) return null;
  if (month !== expectedMonth || year !== expectedYear) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface HorizontalSheetRow {
  employeeCode: string;
  employeeName: string;
  cells: Record<string, number | null>;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
}

export interface ParsedHorizontalSheet {
  rows: HorizontalSheetRow[];
  dateColumns: string[];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) {
    const d = value.getDate();
    const m = MONTH_LABELS[value.getMonth()] ?? 'Jan';
    const y = String(value.getFullYear()).slice(-2);
    return `${String(d).padStart(2, '0')}-${m}-${y}`;
  }
  if (typeof value === 'object' && 'text' in value && value.text) {
    return String(value.text).trim();
  }
  if (typeof value === 'object' && 'result' in value && value.result != null) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue | string): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Math.max(0, value);
  const parsed = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function emptyTailRow(): Pick<HorizontalSheetRow, 'overtimeHours' | 'nightAllowance' | 'punctualityAward'> {
  return { overtimeHours: 0, nightAllowance: 0, punctualityAward: 0 };
}

function applyTailValue(
  tail: Pick<HorizontalSheetRow, 'overtimeHours' | 'nightAllowance' | 'punctualityAward'>,
  type: TailColumnType,
  value: number,
): void {
  if (type === 'ot') tail.overtimeHours = value;
  else if (type === 'night') tail.nightAllowance = value;
  else tail.punctualityAward = value;
}

export async function parseHorizontalWorkbook(
  buffer: Buffer,
  month: number,
  year: number,
): Promise<ParsedHorizontalSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], dateColumns: [] };
  }

  const headerRow = sheet.getRow(1);
  const colCount = Math.max(headerRow.cellCount, sheet.columnCount, 2);
  const columnMap: Array<{ type: 'date'; iso: string } | { type: TailColumnType } | { type: 'skip' }> = [];
  const dateColumns: string[] = [];

  for (let col = 1; col <= colCount; col++) {
    const header = cellText(headerRow.getCell(col).value);
    if (col <= 2 || !header) {
      columnMap[col] = { type: 'skip' };
      continue;
    }
    const tail = resolveTailColumn(header);
    if (tail) {
      columnMap[col] = { type: tail };
      continue;
    }
    const iso = parseHeaderDate(header, month, year);
    if (iso) {
      columnMap[col] = { type: 'date', iso };
      dateColumns.push(iso);
    } else {
      columnMap[col] = { type: 'skip' };
    }
  }

  const rows: HorizontalSheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const employeeCode = cellText(row.getCell(1).value);
    if (!employeeCode) return;

    const employeeName = cellText(row.getCell(2).value);
    const cells: Record<string, number | null> = {};
    const tail = emptyTailRow();

    for (let col = 3; col <= colCount; col++) {
      const mapping = columnMap[col];
      if (!mapping || mapping.type === 'skip') continue;
      if (mapping.type === 'ot' || mapping.type === 'night' || mapping.type === 'punctuality') {
        applyTailValue(tail, mapping.type, cellNumber(row.getCell(col).value));
        continue;
      }
      if (mapping.type === 'date') {
        const raw = cellText(row.getCell(col).value);
        cells[mapping.iso] = raw ? parseStatusInput(raw) : null;
      }
    }

    rows.push({ employeeCode, employeeName, cells, ...tail });
  });

  return { rows, dateColumns };
}

export interface HorizontalExportEmployee {
  employeeCode: string;
  employeeName: string;
  cells: Record<string, number | null>;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
}

export async function buildHorizontalWorkbook(
  _clientName: string,
  _month: number,
  _year: number,
  dates: string[],
  employees: HorizontalExportEmployee[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Signet Workforce ERP';
  const sheet = workbook.addWorksheet('Attendance');

  const headers = [
    EMP_ID_HEADER,
    EMP_NAME_HEADER,
    ...dates.map(formatDisplayDate),
    OT_HOURS_HEADER,
    NIGHT_ALLOWANCE_HEADER,
    PUNCTUALITY_AWARD_HEADER,
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  for (const emp of employees) {
    const rowValues: (string | number)[] = [
      emp.employeeCode,
      emp.employeeName,
      ...dates.map((date) => statusShortCode(emp.cells[date] ?? null)),
      emp.overtimeHours > 0 ? emp.overtimeHours : '',
      emp.nightAllowance > 0 ? emp.nightAllowance : '',
      emp.punctualityAward > 0 ? emp.punctualityAward : '',
    ];
    sheet.addRow(rowValues);
  }

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 22;
  for (let i = 3; i <= dates.length + 2; i++) {
    sheet.getColumn(i).width = 11;
    sheet.getColumn(i).alignment = { horizontal: 'center' };
  }
  const tailStart = dates.length + 3;
  sheet.getColumn(tailStart).width = 10;
  sheet.getColumn(tailStart + 1).width = 14;
  sheet.getColumn(tailStart + 2).width = 16;
  for (let i = tailStart; i <= tailStart + 2; i++) {
    sheet.getColumn(i).alignment = { horizontal: 'center' };
  }

  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function parseHorizontalCsv(content: string, month: number, year: number): ParsedHorizontalSheet {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], dateColumns: [] };

  const splitLine = (line: string) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const headers = splitLine(lines[0]);
  const dateColumns: string[] = [];
  const columnMap: Array<'skip' | 'date' | TailColumnType> = [];

  headers.forEach((header, idx) => {
    if (idx < 2 || !header) {
      columnMap[idx] = 'skip';
      return;
    }
    const tail = resolveTailColumn(header);
    if (tail) {
      columnMap[idx] = tail;
      return;
    }
    const iso = parseHeaderDate(header, month, year);
    if (iso) {
      columnMap[idx] = 'date';
      dateColumns.push(iso);
    } else {
      columnMap[idx] = 'skip';
    }
  });

  const rows: HorizontalSheetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const employeeCode = cols[0] ?? '';
    if (!employeeCode) continue;
    const employeeName = cols[1] ?? '';
    const cells: Record<string, number | null> = {};
    const tail = emptyTailRow();
    let dateIdx = 0;

    for (let col = 2; col < cols.length; col++) {
      const mapping = columnMap[col];
      if (mapping === 'ot' || mapping === 'night' || mapping === 'punctuality') {
        applyTailValue(tail, mapping, cellNumber(cols[col] ?? ''));
      } else if (mapping === 'date' && dateColumns[dateIdx]) {
        const raw = cols[col] ?? '';
        cells[dateColumns[dateIdx]] = raw ? parseStatusInput(raw) : null;
        dateIdx++;
      }
    }

    rows.push({ employeeCode, employeeName, cells, ...tail });
  }

  return { rows, dateColumns };
}
