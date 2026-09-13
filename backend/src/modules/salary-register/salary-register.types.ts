import { SalaryStatutoryConfig } from './salary-register.calculation';

export type SalaryRegisterStatus =
  | 'draft'
  | 'calculated'
  | 'reviewed'
  | 'finalized'
  | 'reopened';

export type SalaryRowValidationStatus = 'ok' | 'warning' | 'error';

export interface SalaryRegisterListItem {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string | null;
  month: number;
  year: number;
  status: SalaryRegisterStatus;
  runNumber: number;
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNetPay: number;
  generatedAt: string;
  generatedBy: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

export interface SalaryRegisterEmployeeRow {
  id: string;
  salaryRegisterId: string;
  employeeId: string;
  sourceAttendanceExtrasId: string | null;
  softCode: string | null;
  employeeCode: string;
  employeeName: string;
  fatherName: string | null;
  designation: string | null;
  aadhaarNumber: string | null;
  accountNumber: string | null;
  uanNumber: string | null;
  esiNumber: string | null;
  monthDays: number;
  payDays: number;
  otHours: number | null;
  basicSalary: number;
  hra: number;
  fixedTotal: number;
  earningBasic: number;
  earningHra: number;
  /** Sourced from Attendance OT amount (overtime_hours column stores rupees). */
  otAmount: number;
  nAll: number;
  grossEarnings: number;
  attAwAfd: number;
  grossTotal: number;
  esic: number;
  epf: number;
  lwf: number;
  totalDeduction: number;
  netPay: number;
  otBasis: string | null;
  pfEligible: boolean;
  esiEligible: boolean;
  lwfEligible: boolean;
  validationStatus: SalaryRowValidationStatus;
  validationMessages: string[];
  calculationVersion: number;
  rowStatus: 'calculated' | 'adjusted' | 'excluded';
}

export interface SalaryRegisterDetail {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string | null;
  clientAddress: string | null;
  month: number;
  year: number;
  status: SalaryRegisterStatus;
  runNumber: number;
  attendanceRegisterId: string | null;
  monthDays: number;
  configSnapshot: SalaryStatutoryConfig;
  summary: {
    totalEmployees: number;
    totalGrossEarnings: number;
    totalAttAwAfd: number;
    totalGross: number;
    totalEsic: number;
    totalEpf: number;
    totalLwf: number;
    totalDeductions: number;
    totalNetPay: number;
  };
  generatedAt: string;
  generatedBy: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  employees: SalaryRegisterEmployeeRow[];
}

export interface SalaryRegisterFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  clientId?: string;
  month?: number;
  year?: number;
  status?: SalaryRegisterStatus;
  search?: string;
}

export interface GenerateSalaryRegisterInput {
  clientId: string;
  month: number;
  year: number;
  createdBy: string;
}

export interface UpdateSalaryEmployeeInput {
  payDays?: number;
  nAll?: number;
  attAwAfd?: number;
}

export interface SalaryRegisterAuditItem {
  id: string;
  action: string;
  reason: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  performedBy: string;
  performedAt: string;
}
