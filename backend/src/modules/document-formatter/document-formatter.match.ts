import {
  DocumentFormatterPreview,
  DocumentFormatterPreviewRow,
  FormatterEmployee,
  ParsedRawAttendance,
} from './document-formatter.types';

export function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizePersonName(value: string): string {
  return value
    .toUpperCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withoutTrailingTag(name: string): string | null {
  const parts = name.split(' ');
  if (parts.length < 3) return null;
  const last = parts[parts.length - 1];
  if (!/^[A-Z]{2}$/.test(last)) return null;
  return parts.slice(0, -1).join(' ');
}

function indexEmployees(employees: FormatterEmployee[]) {
  const bySoftCode = new Map<string, FormatterEmployee[]>();
  const byEmployeeCode = new Map<string, FormatterEmployee[]>();
  const byName = new Map<string, FormatterEmployee[]>();

  const push = (map: Map<string, FormatterEmployee[]>, key: string, employee: FormatterEmployee) => {
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(employee);
    map.set(key, list);
  };

  for (const employee of employees) {
    push(byEmployeeCode, normalizeCode(employee.employeeCode), employee);
    if (employee.softCode) push(bySoftCode, normalizeCode(employee.softCode), employee);
    push(byName, normalizePersonName(employee.fullName), employee);
  }

  return { bySoftCode, byEmployeeCode, byName };
}

/** Drop site reference tags such as "(SR1656)" while keeping the person's name. */
export function sheetDisplayName(value: string): string {
  return value.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstText(sheetValue: string, employeeValue: string | null | undefined): string | null {
  const fromSheet = sheetDisplayName(sheetValue);
  if (fromSheet) return fromSheet;
  const fromEmployee = employeeValue?.trim();
  return fromEmployee || null;
}

function mappedIdentity(source: { code: string; name: string; fatherName: string }, employee: FormatterEmployee) {
  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: firstText(source.name, employee.fullName),
    softCode: source.code.trim() || employee.softCode,
    fatherName: firstText(source.fatherName, employee.fatherName),
  };
}

function presentDaysError(presentDays: number | null): string | null {
  if (presentDays == null || Number.isNaN(presentDays)) return 'Present days are missing on this row.';
  if (presentDays < 0 || presentDays > 31) return 'Present days must be between 0 and 31.';
  return null;
}

export function matchAttendanceRows(
  parsed: ParsedRawAttendance,
  employees: FormatterEmployee[],
  context: { clientId: string; clientName: string },
): DocumentFormatterPreview {
  const { bySoftCode, byEmployeeCode, byName } = indexEmployees(employees);
  const seenSource = new Set<string>();
  const seenEmployee = new Set<string>();
  const rows: DocumentFormatterPreviewRow[] = [];

  for (const source of parsed.rows) {
    const sourceKey = normalizeCode(source.code);
    const base = {
      rowNumber: source.rowNumber,
      sourceCode: source.code,
      sourceName: source.name,
      sourceFatherName: source.fatherName,
      presentDays: source.presentDays,
      overtimeHours: source.overtimeAmount,
      nightAllowance: source.nightAllowance,
      punctualityAward: source.punctualityAward,
      bonus: source.bonus,
    };

    if (seenSource.has(sourceKey)) {
      rows.push({
        ...base,
        status: 'duplicate',
        needsReview: false,
        message: `Soft code ${source.code} already appears earlier in the sheet.`,
        employeeId: null,
        employeeCode: null,
        employeeName: null,
        softCode: null,
        fatherName: null,
      });
      continue;
    }
    seenSource.add(sourceKey);

    const softHits = bySoftCode.get(sourceKey) ?? [];
    const codeHits = byEmployeeCode.get(sourceKey) ?? [];
    const nameKey = normalizePersonName(source.name);
    const nameHits = byName.get(nameKey) ?? [];
    const taggedKey = withoutTrailingTag(nameKey);
    const taggedHits = taggedKey ? byName.get(taggedKey) ?? [] : [];

    let matched: FormatterEmployee | null = null;
    let matchedByName = false;
    let message: string | null = null;

    if (softHits.length > 1) {
      message = `More than one employee on this client uses soft code ${source.code}.`;
    } else if (softHits.length === 1) {
      matched = softHits[0];
    } else if (codeHits.length === 1) {
      matched = codeHits[0];
    } else if (codeHits.length > 1) {
      message = `More than one employee matches code ${source.code}.`;
    } else if (nameHits.length === 1) {
      matched = nameHits[0];
      matchedByName = true;
    } else if (nameHits.length > 1) {
      message = `More than one employee is named ${source.name}.`;
    } else if (taggedHits.length === 1) {
      matched = taggedHits[0];
      matchedByName = true;
    } else if (taggedHits.length > 1) {
      message = `More than one employee is named ${taggedKey}.`;
    } else {
      message = `No active employee on this client has soft code ${source.code}.`;
    }

    if (!matched) {
      rows.push({
        ...base,
        status: 'unmatched',
        needsReview: false,
        message,
        employeeId: null,
        employeeCode: null,
        employeeName: null,
        softCode: null,
        fatherName: null,
      });
      continue;
    }

    if (seenEmployee.has(matched.id)) {
      rows.push({
        ...base,
        status: 'duplicate',
        needsReview: false,
        message: `${matched.employeeCode} already appears earlier in the sheet.`,
        ...mappedIdentity(source, matched),
      });
      continue;
    }

    const daysError = presentDaysError(source.presentDays);
    if (daysError) {
      rows.push({
        ...base,
        status: 'invalid',
        needsReview: false,
        message: daysError,
        ...mappedIdentity(source, matched),
      });
      continue;
    }

    seenEmployee.add(matched.id);
    rows.push({
      ...base,
      status: 'matched',
      needsReview: matchedByName,
      message: matchedByName ? 'Matched by employee name. Confirm this is the right person.' : null,
      ...mappedIdentity(source, matched),
    });
  }

  const summary = {
    sourceRows: rows.length,
    matched: rows.filter((row) => row.status === 'matched').length,
    needsReview: rows.filter((row) => row.needsReview).length,
    unmatched: rows.filter((row) => row.status === 'unmatched').length,
    duplicates: rows.filter((row) => row.status === 'duplicate').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
  };

  return {
    clientId: context.clientId,
    clientName: context.clientName,
    detectedMonth: parsed.detectedMonth,
    detectedYear: parsed.detectedYear,
    monthDays: parsed.monthDays,
    summary,
    rows,
  };
}
