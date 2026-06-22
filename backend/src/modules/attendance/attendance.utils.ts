import { AttendanceStatus } from '../../types/enums';
import {
  ATTENDANCE_STATUS_LABELS,
  EmployeeRegisterRowStatus,
  STATUS_CODES,
  STATUS_CYCLE,
} from './attendance.types';

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthDateRange(year: number, month: number): { from: string; to: string; dates: string[]; days: number[] } {
  const total = daysInMonth(year, month);
  const dates: string[] = [];
  const days: number[] = [];
  for (let d = 1; d <= total; d++) {
    days.push(d);
    dates.push(toDateStr(year, month, d));
  }
  return { from: dates[0], to: dates[dates.length - 1], dates, days };
}

export function statusLabel(status: number | null | undefined): string {
  if (status == null) return 'Not Marked';
  return ATTENDANCE_STATUS_LABELS[status] ?? 'Unknown';
}

export function statusShortCode(status: number | null | undefined): string {
  switch (status) {
    case AttendanceStatus.Present: return 'P';
    case AttendanceStatus.Absent: return 'A';
    case AttendanceStatus.OnLeave: return 'L';
    case AttendanceStatus.HalfDay: return 'HD';
    case AttendanceStatus.Holiday: return 'H';
    case AttendanceStatus.WeekOff: return 'WO';
    default: return '-';
  }
}

export function nextCycleStatus(current: number | null | undefined): number | null {
  const value = current ?? null;
  const idx = STATUS_CYCLE.findIndex((s) => s === value);
  const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
  return next ?? null;
}

export function parseStatusInput(raw: string): number | null {
  const key = raw.trim().toUpperCase();
  if (!key || key === '-' || key === 'NM' || key === 'NOT MARKED') return null;
  return STATUS_CODES[key] ?? null;
}

export function countByStatus(cells: Record<string, number | null>, dates: string[]) {
  let present = 0;
  let absent = 0;
  let leave = 0;
  let halfDay = 0;
  let holiday = 0;
  let weekOff = 0;
  let unmarked = 0;

  for (const date of dates) {
    const s = cells[date] ?? null;
    if (s == null) { unmarked++; continue; }
    switch (s) {
      case AttendanceStatus.Present: present++; break;
      case AttendanceStatus.Absent: absent++; break;
      case AttendanceStatus.OnLeave: leave++; break;
      case AttendanceStatus.HalfDay: halfDay++; break;
      case AttendanceStatus.Holiday: holiday++; break;
      case AttendanceStatus.WeekOff: weekOff++; break;
      default: unmarked++; break;
    }
  }

  return { present, absent, leave, halfDay, holiday, weekOff, unmarked };
}

export function employeeRowStatus(
  counts: { unmarked: number },
  totalDays: number,
  registerLocked: boolean,
): EmployeeRegisterRowStatus {
  if (registerLocked) return 'locked';
  if (counts.unmarked === totalDays) return 'not_started';
  if (counts.unmarked > 0) return 'draft';
  return 'entered';
}

export function isSunday(year: number, month: number, day: number): boolean {
  return new Date(year, month - 1, day).getDay() === 0;
}
