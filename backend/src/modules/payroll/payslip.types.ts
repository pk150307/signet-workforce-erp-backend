export interface PayslipLineItem {
  code: string;
  label: string;
  amount: number;
  rate?: number | null;
  note?: string | null;
}

export interface PayslipListItem {
  id: string;
  slipNumber: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  month: number;
  year: number;
  monthName: string;
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
  status: string;
  generatedAt: string;
  filePath: string | null;
}

export interface PayslipPrintData {
  id: string;
  slipNumber: string;
  status: string;
  generatedAt: string;
  payPeriod: {
    month: number;
    year: number;
    monthName: string;
    fromDate: string;
    toDate: string;
  };
  company: {
    name: string;
    legalName: string | null;
    address: string;
    gstNumber: string | null;
    panNumber: string | null;
    registrationNumber: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
  };
  employee: {
    id: string;
    code: string;
    name: string;
    department: string;
    designation: string;
    siteName: string | null;
    joiningDate: string;
    bankName: string | null;
    accountNumber: string | null;
    ifscCode: string | null;
    panNumber: string | null;
    uanNumber: string | null;
    pfNumber: string | null;
    esiNumber: string | null;
  };
  attendance: {
    workingDays: number;
    presentDays: number;
    leaveDays: number;
    absentDays: number;
  };
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  totals: {
    grossEarnings: number;
    totalDeductions: number;
    netSalary: number;
  };
}

export interface GeneratePayslipsInput {
  month: number;
  year: number;
  createdBy: string;
  employeeIds?: string[];
  clientId?: string;
  departmentId?: string;
}

export interface PayslipFilter {
  page: number;
  pageSize: number;
  month?: number;
  year?: number;
  employeeId?: string;
  clientId?: string;
  departmentId?: string;
  search?: string;
  status?: string;
}

export interface UpdatePayslipStatusInput {
  status: string;
  updatedBy: string;
  note?: string;
}

export interface BulkPayslipActionInput {
  payslipIds: string[];
  action: 'email' | 'download';
  updatedBy: string;
}
