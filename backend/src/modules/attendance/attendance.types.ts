import { AttendanceStatus } from '../../types/enums';

export type RegisterStatus = 'draft' | 'locked';
export type EmployeeRegisterRowStatus = 'not_started' | 'draft' | 'entered' | 'locked';

export interface RegisterFilter {
  clientId: string;
  month: number;
  year: number;
}

export interface AttendanceRegisterMeta {
  id: string;
  clientId: string;
  clientName: string;
  month: number;
  year: number;
  status: RegisterStatus;
  lockedAt: string | null;
  lockedBy: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  totalEmployees: number;
  totalDays: number;
  markedCells: number;
  unmarkedCells: number;
  isComplete: boolean;
}

export interface AttendanceEmployeeListItem {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  siteName: string;
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  halfDayCount: number;
  holidayCount: number;
  weekOffCount: number;
  unmarkedCount: number;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
  rowStatus: EmployeeRegisterRowStatus;
}

export interface AttendanceGridEmployee {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  siteName: string;
  cells: Record<string, number | null>;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
}

export interface AttendanceGridResponse {
  register: AttendanceRegisterMeta;
  days: number[];
  dates: string[];
  employees: AttendanceGridEmployee[];
}

export interface AttendanceCellUpdate {
  employeeId: string;
  date: string;
  status: number | null;
}

export interface SubmitEmployeeRowInput {
  clientId: string;
  month: number;
  year: number;
  cells: Array<{ date: string; status: number | null }>;
  overtimeHours?: number;
  nightAllowance?: number;
  punctualityAward?: number;
}

export interface SubmitEmployeeRowResponse {
  employee: AttendanceGridEmployee;
  register: AttendanceRegisterMeta;
}

export interface BulkMarkInput {
  clientId: string;
  month: number;
  year: number;
  action: 'mark_sundays' | 'mark_all_present' | 'clear_unmarked';
  status?: number;
}

export interface ImportPreviewEmployeeRow {
  employeeCode: string;
  employeeName?: string;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
  cellsUpdated: number;
  error?: string;
}

export interface ImportPreviewResult {
  validRows: ImportPreviewEmployeeRow[];
  errors: ImportPreviewEmployeeRow[];
  preview: AttendanceGridEmployee[];
  totalCellsParsed: number;
}

export interface LockRegisterInput {
  clientId: string;
  month: number;
  year: number;
  verified: boolean;
}

export interface UnlockRegisterInput {
  clientId: string;
  month: number;
  year: number;
  reason: string;
}

export interface UnlockLogEntry {
  id: string;
  reason: string;
  unlockedBy: string;
  unlockedAt: string;
}

export interface EmployeeAttendanceCalendar {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  clientName: string;
  siteName: string;
  month: number;
  year: number;
  registerStatus: RegisterStatus;
  summary: {
    present: number;
    absent: number;
    leave: number;
    halfDay: number;
    holiday: number;
    weekOff: number;
    unmarked: number;
    workingDays: number;
    overtimeHours: number;
    nightAllowance: number;
    punctualityAward: number;
  };
  days: Array<{
    date: string;
    day: number;
    dayOfWeek: number;
    status: number | null;
    statusLabel: string;
  }>;
}

export const ATTENDANCE_STATUS_LABELS: Record<number, string> = {
  [AttendanceStatus.Present]: 'Present',
  [AttendanceStatus.Absent]: 'Absent',
  [AttendanceStatus.HalfDay]: 'Half Day',
  [AttendanceStatus.OnLeave]: 'Leave',
  [AttendanceStatus.Holiday]: 'Holiday',
  [AttendanceStatus.WeekOff]: 'Week Off',
};

export const STATUS_CYCLE: Array<number | null> = [
  AttendanceStatus.Present,
  AttendanceStatus.Absent,
  AttendanceStatus.OnLeave,
  AttendanceStatus.HalfDay,
  AttendanceStatus.Holiday,
  null,
];

export const STATUS_CODES: Record<string, number> = {
  P: AttendanceStatus.Present,
  PRESENT: AttendanceStatus.Present,
  A: AttendanceStatus.Absent,
  ABSENT: AttendanceStatus.Absent,
  L: AttendanceStatus.OnLeave,
  LEAVE: AttendanceStatus.OnLeave,
  HD: AttendanceStatus.HalfDay,
  HALF: AttendanceStatus.HalfDay,
  'HALF-DAY': AttendanceStatus.HalfDay,
  H: AttendanceStatus.Holiday,
  HOL: AttendanceStatus.Holiday,
  HOLIDAY: AttendanceStatus.Holiday,
  WO: AttendanceStatus.WeekOff,
  W: AttendanceStatus.WeekOff,
};
