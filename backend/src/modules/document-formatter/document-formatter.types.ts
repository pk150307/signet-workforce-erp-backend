export interface FormatterEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  fatherName: string | null;
  softCode: string | null;
}

export interface RawAttendanceRow {
  rowNumber: number;
  code: string;
  name: string;
  fatherName: string;
  presentDays: number | null;
  /** OT earned in rupees. The attendance register stores this in the OT Hours column. */
  overtimeAmount: number;
  nightAllowance: number;
  punctualityAward: number;
  bonus: number;
  presentDaysCached: number | null;
  presentDaysComputed: number | null;
}

export interface ParsedRawAttendance {
  detectedMonth: number | null;
  detectedYear: number | null;
  monthDays: number | null;
  rows: RawAttendanceRow[];
}

export type FormatterRowStatus = 'matched' | 'unmatched' | 'duplicate' | 'invalid';

export interface DocumentFormatterPreviewRow {
  rowNumber: number;
  status: FormatterRowStatus;
  /** Name match that should be checked before import. */
  needsReview: boolean;
  message: string | null;
  sourceCode: string;
  sourceName: string;
  sourceFatherName: string;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  softCode: string | null;
  fatherName: string | null;
  presentDays: number | null;
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
  bonus: number;
}

export interface DocumentFormatterPreview {
  clientId: string;
  clientName: string;
  detectedMonth: number | null;
  detectedYear: number | null;
  monthDays: number | null;
  summary: {
    sourceRows: number;
    matched: number;
    needsReview: number;
    unmatched: number;
    duplicates: number;
    invalid: number;
  };
  rows: DocumentFormatterPreviewRow[];
}
