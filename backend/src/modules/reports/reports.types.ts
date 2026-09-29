export interface ReportFilter {
  month?: number;
  year?: number;
  clientId?: string;
}

export interface ReportPeriod {
  label: string;
  month: number | null;
  year: number | null;
  fromDate: string | null;
  toDate: string | null;
  clientId: string | null;
  clientName: string | null;
}

export interface ReportRow {
  label: string;
  value: string | number;
  trend?: number | null;
}

export interface AttendanceReport {
  period: ReportPeriod;
  summary: {
    present: number;
    absent: number;
    onLeave: number;
    late: number;
    halfDay: number;
    holiday: number;
    weekOff: number;
    total: number;
  };
  rows: ReportRow[];
}

export interface PayrollReport {
  period: ReportPeriod;
  summary: {
    grossPay: number;
    deductions: number;
    netPay: number;
    employeeCount: number;
  };
  rows: ReportRow[];
}

export interface InvoiceReport {
  period: ReportPeriod;
  summary: {
    totalBilled: number;
    collected: number;
    outstanding: number;
    invoiceCount: number;
  };
  rows: ReportRow[];
}

export interface EmployeeReport {
  period: ReportPeriod;
  summary: {
    totalEmployees: number;
    active: number;
    newJoiners: number;
    exits: number;
  };
  rows: ReportRow[];
}
