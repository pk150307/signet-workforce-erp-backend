import ExcelJS from 'exceljs';
import { applyReadablePrintLayout } from '../../utils/excel-export';
import { buildPdfTableBuffer } from '../../utils/pdf-export';

export const EMP_ID_HEADER = 'Emp ID';
export const EMP_NAME_HEADER = 'Emp Name';
export const SOFT_CODE_HEADER = 'Soft Code';
export const FATHER_NAME_HEADER = 'Father Name';
export const PRESENT_DAYS_HEADER = 'Present Days';
export const OT_HOURS_HEADER = 'OT Hours';
export const NIGHT_ALLOWANCE_HEADER = 'Night Allowance';
export const PUNCTUALITY_AWARD_HEADER = 'Punctuality Award';
export const BONUS_HEADER = 'Bonus';

const MONTHLY_EXPORT_HEADERS = [
  EMP_ID_HEADER,
  EMP_NAME_HEADER,
  SOFT_CODE_HEADER,
  FATHER_NAME_HEADER,
  PRESENT_DAYS_HEADER,
  OT_HOURS_HEADER,
  NIGHT_ALLOWANCE_HEADER,
  PUNCTUALITY_AWARD_HEADER,
  BONUS_HEADER,
] as const;

type TailColumnType = 'present' | 'ot' | 'night' | 'punctuality' | 'bonus';

export function isPresentDaysHeader(header: string): boolean {
  const key = String(header ?? '').trim().toLowerCase();
  return key === 'present days' || key === 'present' || key === 'total present days' || key === 'pd';
}

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

export function isBonusHeader(header: string): boolean {
  const key = String(header ?? '').trim().toLowerCase();
  return key === 'bonus' || key === 'employee bonus';
}

function resolveTailColumn(header: string): TailColumnType | null {
  if (isPresentDaysHeader(header)) return 'present';
  if (isOvertimeHeader(header)) return 'ot';
  if (isNightAllowanceHeader(header)) return 'night';
  if (isPunctualityAwardHeader(header)) return 'punctuality';
  if (isBonusHeader(header)) return 'bonus';
  return null;
}

export interface MonthlySheetRow {
  employeeCode: string;
  employeeName: string;
  presentDays: number | null;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
  bonus: number;
}

export interface ParsedMonthlySheet {
  rows: MonthlySheetRow[];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
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

function cellNumberOrNull(value: ExcelJS.CellValue | string): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Math.max(0, value);
  const parsed = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function emptyTailRow(): Omit<MonthlySheetRow, 'employeeCode' | 'employeeName'> {
  return {
    presentDays: null,
    overtimeHours: 0,
    nightAllowance: 0,
    punctualityAward: 0,
    bonus: 0,
  };
}

function applyTailValue(
  tail: Omit<MonthlySheetRow, 'employeeCode' | 'employeeName'>,
  type: TailColumnType,
  value: number | null,
): void {
  if (type === 'present') tail.presentDays = value;
  else if (type === 'ot') tail.overtimeHours = value ?? 0;
  else if (type === 'night') tail.nightAllowance = value ?? 0;
  else if (type === 'punctuality') tail.punctualityAward = value ?? 0;
  else tail.bonus = value ?? 0;
}

export async function parseMonthlyWorkbook(buffer: Buffer): Promise<ParsedMonthlySheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [] };
  }

  const headerRow = sheet.getRow(1);
  const colCount = Math.max(headerRow.cellCount, sheet.columnCount, 2);
  const columnMap: Array<TailColumnType | 'skip'> = [];

  for (let col = 1; col <= colCount; col++) {
    const header = cellText(headerRow.getCell(col).value);
    if (col <= 2 || !header) {
      columnMap[col] = 'skip';
      continue;
    }
    columnMap[col] = resolveTailColumn(header) ?? 'skip';
  }

  const rows: MonthlySheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const employeeCode = cellText(row.getCell(1).value);
    if (!employeeCode) return;

    const employeeName = cellText(row.getCell(2).value);
    const tail = emptyTailRow();

    for (let col = 3; col <= colCount; col++) {
      const mapping = columnMap[col];
      if (!mapping || mapping === 'skip') continue;
      const raw = row.getCell(col).value;
      applyTailValue(
        tail,
        mapping,
        mapping === 'present' ? cellNumberOrNull(raw) : cellNumber(raw),
      );
    }

    rows.push({ employeeCode, employeeName, ...tail });
  });

  return { rows };
}

export interface MonthlyExportEmployee {
  employeeCode: string;
  employeeName: string;
  softCode?: string | null;
  fatherName?: string | null;
  presentDays: number | null;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
  bonus: number;
}

export async function buildMonthlyWorkbook(
  employees: MonthlyExportEmployee[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Signet Workforce ERP';
  const sheet = workbook.addWorksheet('Attendance');

  const headers = [...MONTHLY_EXPORT_HEADERS];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  for (const emp of employees) {
    sheet.addRow(monthlyExportRow(emp));
  }

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 22;
  for (let i = 5; i <= 9; i++) {
    sheet.getColumn(i).width = 16;
    sheet.getColumn(i).alignment = { horizontal: 'center' };
  }

  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 4 }];
  applyReadablePrintLayout(sheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function buildMonthlyPdf(
  employees: MonthlyExportEmployee[],
  options?: { title?: string; subtitle?: string },
): Promise<Buffer> {
  return buildPdfTableBuffer({
    title: options?.title ?? 'Attendance Register',
    subtitle: options?.subtitle,
    headers: [...MONTHLY_EXPORT_HEADERS],
    rows: employees.map(monthlyExportRow),
    landscape: true,
  });
}

function monthlyExportRow(
  emp: MonthlyExportEmployee,
): Array<string | number | null | undefined> {
  return [
    emp.employeeCode,
    emp.employeeName,
    emp.softCode ?? '',
    emp.fatherName ?? '',
    emp.presentDays != null ? emp.presentDays : '',
    emp.overtimeHours > 0 ? emp.overtimeHours : '',
    emp.nightAllowance > 0 ? emp.nightAllowance : '',
    emp.punctualityAward > 0 ? emp.punctualityAward : '',
    emp.bonus > 0 ? emp.bonus : '',
  ];
}

export function parseMonthlyCsv(content: string): ParsedMonthlySheet {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const columnMap: Array<TailColumnType | 'skip'> = headers.map((header, index) => {
    if (index <= 1) return 'skip';
    return resolveTailColumn(header) ?? 'skip';
  });

  const rows: MonthlySheetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const employeeCode = cols[0] ?? '';
    if (!employeeCode) continue;
    const employeeName = cols[1] ?? '';
    const tail = emptyTailRow();
    for (let col = 2; col < cols.length; col++) {
      const mapping = columnMap[col];
      if (!mapping || mapping === 'skip') continue;
      applyTailValue(
        tail,
        mapping,
        mapping === 'present' ? cellNumberOrNull(cols[col]) : cellNumber(cols[col]),
      );
    }
    rows.push({ employeeCode, employeeName, ...tail });
  }

  return { rows };
}
