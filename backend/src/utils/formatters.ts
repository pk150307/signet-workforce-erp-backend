export function formatTime(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return value.length === 5 ? `${value}:00` : value;
  }
  return value;
}

export function formatInterval(value: string | null | undefined): string | null {
  if (!value) return null;
  return value;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Calendar date from a JS Date without UTC day-shift (IST midnight → previous UTC day). */
function calendarDateFromDate(value: Date): string {
  const utcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0;

  if (utcMidnight) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

export function formatDate(value: Date | string | null | undefined): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : calendarDateFromDate(value);
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return calendarDateFromDate(parsed);
  }

  return null;
}

/** First name only when last name is blank — never invent a placeholder last name. */
export function formatPersonName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return [firstName, lastName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

export function formatDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export function countWorkingDays(year: number, month: number): number {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) count++;
  }
  return count;
}

/** Total calendar days in a month (used for paysroll pro-rating and payslip working days). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthName(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : parseFloat(value);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Round to nearest whole rupee (22.56 → 23, 22.40 → 22). */
export function roundOff(value: number): number {
  return Math.round(value);
}
