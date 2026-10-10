import ExcelJS from 'exceljs';
import { AppError } from '../../common/errors';
import { round2, roundOff } from '../../utils/formatters';
import { ParsedRawAttendance, RawAttendanceRow } from './document-formatter.types';

const MAX_ROWS = 5000;
const SCAN_COLUMNS = 150;
const MIN_DAY_COLUMNS = 20;

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

type SummaryField =
  | 'code'
  | 'name'
  | 'father'
  | 'basic'
  | 'gwa'
  | 'pot'
  | 'tot'
  | 'tday'
  | 'present'
  | 'otpay'
  | 'night'
  | 'nall'
  | 'punct'
  | 'bonus';

const HEADER_FIELDS: Record<string, SummaryField> = {
  code: 'code',
  'soft code': 'code',
  softcode: 'code',
  'client soft code': 'code',
  name: 'name',
  'emp name': 'name',
  'employee name': 'name',
  'father name': 'father',
  'fathers name': 'father',
  'father s name': 'father',
  basic: 'basic',
  gwa: 'gwa',
  'p ot': 'pot',
  pot: 'pot',
  't ot': 'tot',
  tot: 'tot',
  't day': 'tday',
  tday: 'tday',
  'total day': 'tday',
  'total days': 'tday',
  'present days': 'present',
  'present day': 'present',
  'total present days': 'present',
  'ot hours': 'otpay',
  'ot hour': 'otpay',
  'ot hrs': 'otpay',
  'overtime hours': 'otpay',
  'overtime amount': 'otpay',
  night: 'night',
  'n all': 'nall',
  nall: 'nall',
  'night allowance': 'nall',
  punct: 'punct',
  punctu: 'punct',
  punctuality: 'punct',
  'punctuality award': 'punct',
  'o all': 'bonus',
  oall: 'bonus',
  bonus: 'bonus',
};

interface ReadValue {
  text: string;
  number: number | null;
  formula: string | null;
}

interface SheetHeader {
  rowNumber: number;
  columns: Partial<Record<SummaryField, number>>;
  dayColumns: number[];
}

interface DayTally {
  presentDays: number;
  otHours: number;
  penalties: number;
}

const EMPTY_READ: ReadValue = { text: '', number: null, formula: null };

function headerKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\./g, ' ')
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readValue(value: ExcelJS.CellValue): ReadValue {
  if (value == null || value === '') return EMPTY_READ;
  if (value instanceof Date) {
    return { text: value.toISOString().slice(0, 10), number: null, formula: null };
  }
  if (typeof value === 'number') {
    return { text: String(value), number: Number.isFinite(value) ? value : null, formula: null };
  }
  if (typeof value === 'string') {
    const text = value.trim();
    const numericText = text.replace(/,/g, '');
    const parsed = /^-?\d+(\.\d+)?$/.test(numericText) ? Number(numericText) : null;
    return {
      text,
      number: parsed != null && Number.isFinite(parsed) ? parsed : null,
      formula: null,
    };
  }
  if (typeof value === 'boolean') {
    return { text: value ? 'TRUE' : 'FALSE', number: null, formula: null };
  }
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return readValue(value.richText.map((part) => part.text).join(''));
    }
    if ('error' in value && value.error) {
      return EMPTY_READ;
    }
    if ('text' in value && typeof value.text === 'string' && !('formula' in value) && !('result' in value)) {
      return readValue(value.text);
    }
    const formula = 'formula' in value && value.formula ? String(value.formula) : null;
    if ('result' in value && value.result != null && value.result !== '') {
      const inner = readValue(value.result as ExcelJS.CellValue);
      return { text: inner.text, number: inner.number, formula };
    }
    return { text: '', number: null, formula };
  }
  return { text: String(value).trim(), number: null, formula: null };
}

function looksLikeEmployeeCode(value: string): boolean {
  const code = value.trim();
  if (code.length < 3 || code.length > 24) return false;
  if (/salary|grand\s*total/i.test(code)) return false;
  if (!/[a-z]/i.test(code) || !/\d/.test(code)) return false;
  if (/[^a-z0-9\-_/ ]/i.test(code)) return false;
  return true;
}

function findDayColumns(headers: ReadValue[]): number[] {
  let best: number[] = [];
  let current: number[] = [];
  let expected = 1;

  const commit = () => {
    if (current.length > best.length) best = current.slice();
  };

  for (let col = 1; col < headers.length; col++) {
    const value = headers[col]?.number;
    const day = value != null && Number.isInteger(value) ? value : null;
    if (day === expected && expected <= 31) {
      current.push(col);
      expected += 1;
      if (expected > 31) {
        commit();
        current = [];
        expected = 1;
      }
      continue;
    }
    if (current.length) {
      commit();
      current = [];
      expected = 1;
      if (day === 1) {
        current.push(col);
        expected = 2;
      }
    }
  }
  commit();
  return best.length >= MIN_DAY_COLUMNS ? best : [];
}

function findHeader(sheet: ExcelJS.Worksheet): SheetHeader | null {
  const lastRow = Math.min(sheet.rowCount || 0, 20);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const headers: ReadValue[] = [];
    const unique = new Set<string>();
    for (let col = 1; col <= SCAN_COLUMNS; col++) {
      const cell = readValue(row.getCell(col).value);
      headers[col] = cell;
      if (cell.text) unique.add(cell.text);
    }
    if (unique.size < 3) continue;

    const columns: Partial<Record<SummaryField, number>> = {};
    for (let col = 1; col <= SCAN_COLUMNS; col++) {
      const key = headerKey(headers[col]?.text ?? '');
      const field = HEADER_FIELDS[key];
      if (field && columns[field] == null) columns[field] = col;
    }
    if (columns.code == null || columns.name == null) continue;

    return {
      rowNumber,
      columns,
      dayColumns: findDayColumns(headers),
    };
  }
  return null;
}

function looksLikeAttendanceTemplate(sheet: ExcelJS.Worksheet): boolean {
  const row = sheet.getRow(1);
  const labels = new Set<string>();
  for (let col = 1; col <= 12; col++) {
    labels.add(headerKey(readValue(row.getCell(col).value).text));
  }
  return labels.has('emp id') && labels.has('present days');
}

function detectPeriod(sheet: ExcelJS.Worksheet): { month: number | null; year: number | null } {
  const lastRow = Math.min(sheet.rowCount || 0, 15);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    for (let col = 1; col <= 8; col++) {
      const text = readValue(row.getCell(col).value).text;
      const match = text.match(/month of\s+([a-z]+)\s+(20\d{2})/i);
      if (!match) continue;
      const month = MONTH_INDEX[match[1].toLowerCase()];
      const year = Number(match[2]);
      if (month && year) return { month, year };
    }
  }
  return { month: null, year: null };
}

function findMonthDays(
  sheet: ExcelJS.Worksheet,
  header: SheetHeader,
): number | null {
  const startCol = header.dayColumns.length
    ? header.dayColumns[header.dayColumns.length - 1] + 1
    : 1;
  const rows = [header.rowNumber, header.rowNumber - 1, header.rowNumber - 2].filter((row) => row >= 1);
  for (const rowNumber of rows) {
    const row = sheet.getRow(rowNumber);
    for (let col = startCol; col <= SCAN_COLUMNS; col++) {
      if (header.dayColumns.includes(col)) continue;
      const value = readValue(row.getCell(col).value).number;
      if (value != null && Number.isInteger(value) && value >= 28 && value <= 31) {
        return value;
      }
    }
  }
  return null;
}

type DayKind = 'number' | 'absent' | 'weekOff' | 'half' | 'sick' | 'casual' | 'earned' | 'holiday' | 'blank';

function classifyDay(cell: ReadValue): { kind: DayKind; value: number } {
  if (cell.number != null && cell.formula == null) {
    return { kind: 'number', value: cell.number };
  }
  if (cell.number != null && !cell.text) {
    return { kind: 'number', value: cell.number };
  }
  const token = cell.text.toUpperCase().replace(/\s+/g, '');
  if (!token) {
    if (cell.number != null) return { kind: 'number', value: cell.number };
    return { kind: 'blank', value: 0 };
  }
  if (token === 'A' || token === 'ABS' || token === 'ABSENT') return { kind: 'absent', value: 0 };
  if (token === 'W/O' || token === 'W/OFF' || token === 'WO') return { kind: 'weekOff', value: 0 };
  if (token === 'P/2' || token === 'HFD' || token === 'HD') return { kind: 'half', value: 0 };
  if (token === 'S/L' || token === 'SL') return { kind: 'sick', value: 0 };
  if (token === 'C/L' || token === 'CL') return { kind: 'casual', value: 0 };
  if (token === 'E/L' || token === 'EL') return { kind: 'earned', value: 0 };
  if (token === 'H' || token === 'HOLIDAY') return { kind: 'holiday', value: 0 };
  if (cell.number != null) return { kind: 'number', value: cell.number };
  return { kind: 'blank', value: 0 };
}

function tallyDays(marks: Array<{ kind: DayKind; value: number }>, previousOt: number): DayTally {
  let numericCount = 0;
  let otHours = previousOt;
  let weekOff = 0;
  let halfCells = 0;
  let sick = 0;
  let casual = 0;
  let earned = 0;
  let holiday = 0;
  let absent = 0;

  for (const mark of marks) {
    if (mark.kind === 'number') {
      numericCount += 1;
      otHours += mark.value;
    } else if (mark.kind === 'weekOff') weekOff += 1;
    else if (mark.kind === 'half') halfCells += 1;
    else if (mark.kind === 'sick') sick += 1;
    else if (mark.kind === 'casual') casual += 1;
    else if (mark.kind === 'earned') earned += 1;
    else if (mark.kind === 'holiday') holiday += 1;
    else if (mark.kind === 'absent') absent += 1;
  }

  const workingDays = numericCount + sick + casual + earned + halfCells / 2 + holiday;
  return {
    presentDays: workingDays + weekOff,
    otHours,
    penalties: absent + halfCells + casual + sick,
  };
}

function punctualityFromPenalties(penalties: number): number {
  if (penalties <= 0) return 800;
  if (penalties === 1) return 600;
  if (penalties === 2) return 400;
  return 0;
}

function nightRate(formula: string | null): number {
  const match = formula?.match(/\*\s*(\d+(?:\.\d+)?)/);
  if (!match) return 50;
  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100000) return 50;
  return rate;
}

function nonNegative(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, value);
}

function cellAt(row: ExcelJS.Row, col: number | undefined): ReadValue {
  if (!col) return EMPTY_READ;
  return readValue(row.getCell(col).value);
}

function parseSheet(sheet: ExcelJS.Worksheet, header: SheetHeader): ParsedRawAttendance {
  if ((sheet.rowCount || 0) > MAX_ROWS) {
    throw new AppError(400, 'This sheet has too many rows to format.');
  }

  const period = detectPeriod(sheet);
  const monthDays = findMonthDays(sheet, header);
  const rows: RawAttendanceRow[] = [];
  const lastRow = Math.min(sheet.rowCount || 0, MAX_ROWS);

  for (let rowNumber = header.rowNumber + 1; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const codeCell = cellAt(row, header.columns.code);
    const nameCell = cellAt(row, header.columns.name);
    if (!looksLikeEmployeeCode(codeCell.text)) continue;
    if (/grand\s*total/i.test(nameCell.text)) continue;

    const marks = header.dayColumns.map((col) => classifyDay(readValue(row.getCell(col).value)));
    const previousOt = nonNegative(cellAt(row, header.columns.pot).number) ?? 0;
    const tally = header.dayColumns.length ? tallyDays(marks, previousOt) : null;

    const directPresent = header.columns.present != null
      ? nonNegative(cellAt(row, header.columns.present).number)
      : null;
    const presentDaysCached = directPresent != null
      ? round2(directPresent)
      : nonNegative(cellAt(row, header.columns.tday).number);
    const presentDaysComputed = tally ? round2(tally.presentDays) : null;
    const presentDays = presentDaysCached != null
      ? round2(presentDaysCached)
      : presentDaysComputed;

    const otHours = nonNegative(cellAt(row, header.columns.tot).number) ?? tally?.otHours ?? 0;
    // Attendance stores rupees in the template's OT Hours column.
    // A sheet that already has that column is copied as-is. A site register's GWA is the same amount.
    const directOvertime = header.columns.otpay != null
      ? nonNegative(cellAt(row, header.columns.otpay).number)
      : null;
    const gwa = nonNegative(cellAt(row, header.columns.gwa).number);
    const basic = nonNegative(cellAt(row, header.columns.basic).number);
    let overtimeAmount = 0;
    if (directOvertime != null) {
      overtimeAmount = roundOff(directOvertime);
    } else if (gwa != null) {
      overtimeAmount = roundOff(gwa);
    } else if (basic != null && basic > 0 && monthDays && otHours > 0) {
      overtimeAmount = roundOff((basic / monthDays / 8) * otHours);
    }

    const nightCell = cellAt(row, header.columns.nall);
    const nightCount = nonNegative(cellAt(row, header.columns.night).number) ?? 0;
    const nightAllowance = nightCell.number != null
      ? roundOff(Math.max(0, nightCell.number))
      : nightCount > 0
        ? roundOff(nightCount * nightRate(nightCell.formula))
        : 0;

    const punctCell = cellAt(row, header.columns.punct);
    const punctualityAward = punctCell.number != null
      ? roundOff(Math.max(0, punctCell.number))
      : tally
        ? punctualityFromPenalties(tally.penalties)
        : 0;

    const bonusCell = nonNegative(cellAt(row, header.columns.bonus).number);

    rows.push({
      rowNumber,
      code: codeCell.text.trim(),
      name: nameCell.text.trim(),
      fatherName: cellAt(row, header.columns.father).text.trim(),
      presentDays,
      overtimeAmount,
      nightAllowance,
      punctualityAward,
      bonus: bonusCell != null ? roundOff(bonusCell) : 0,
      presentDaysCached: presentDaysCached != null ? round2(presentDaysCached) : null,
      presentDaysComputed,
    });
  }

  if (!rows.length) {
    throw new AppError(400, 'No employee rows were found. Check the Soft Code column.');
  }

  return {
    detectedMonth: period.month,
    detectedYear: period.year,
    monthDays,
    rows,
  };
}

export async function parseRawAttendanceBuffer(buffer: Buffer): Promise<ParsedRawAttendance> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);

  for (const sheet of workbook.worksheets) {
    const header = findHeader(sheet);
    if (header) return parseSheet(sheet, header);
  }

  const first = workbook.worksheets[0];
  if (first && looksLikeAttendanceTemplate(first)) {
    throw new AppError(
      400,
      'This file has Emp ID and Present Days, but no Soft Code and Emp Name columns to match employees.',
    );
  }
  throw new AppError(
    400,
    'Could not find Soft Code and Emp Name columns. Keep those column names in the raw Excel.',
  );
}
