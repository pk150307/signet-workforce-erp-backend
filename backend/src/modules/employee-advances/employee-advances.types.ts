export type EmployeeAdvanceStatus = 'draft' | 'open' | 'finalized' | 'reopened';

export interface EmployeeAdvanceListItem {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string | null;
  month: number;
  year: number;
  status: EmployeeAdvanceStatus;
  runNumber: number;
  totalEmployees: number;
  totalAdvance: number;
  totalSalaryNetPay: number;
  totalPayable: number;
  salaryRegisterId: string | null;
  generatedAt: string;
  generatedBy: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

export interface EmployeeAdvancePayment {
  id: string;
  entryId: string;
  paidOn: string; // YYYY-MM-DD
  amount: number;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

export interface EmployeeAdvanceEntry {
  id: string;
  advanceRegisterId: string;
  employeeId: string;
  softCode: string | null;
  employeeCode: string;
  employeeName: string;
  fatherName: string | null;
  designation: string | null;
  /** Sum of dated payments for this employee in the period. */
  advanceAmount: number;
  paymentCount: number;
  notes: string | null;
  salaryNetPay: number | null;
  payableAmount: number | null;
  payments: EmployeeAdvancePayment[];
}

export interface EmployeeAdvanceDetail {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string | null;
  month: number;
  year: number;
  status: EmployeeAdvanceStatus;
  runNumber: number;
  salaryRegisterId: string | null;
  summary: {
    totalEmployees: number;
    totalAdvance: number;
    totalSalaryNetPay: number;
    totalPayable: number;
  };
  generatedAt: string;
  generatedBy: string;
  finalizedAt: string | null;
  finalizedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  employees: EmployeeAdvanceEntry[];
}

export interface EmployeeAdvanceFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  clientId?: string;
  month?: number;
  year?: number;
  status?: EmployeeAdvanceStatus;
  search?: string;
}

export interface GenerateEmployeeAdvanceInput {
  clientId: string;
  month: number;
  year: number;
  createdBy: string;
}

export interface UpsertAdvancePaymentInput {
  paidOn: string;
  amount: number;
  notes?: string | null;
}
