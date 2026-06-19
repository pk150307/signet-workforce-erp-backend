export interface PayslipLineItem {
  code: string;
  label: string;
  amount: number;
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
  generatedAt: string;
  filePath: string | null;
}

export interface PayslipPrintData {
  slipNumber: string;
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
    address: string;
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
}

export interface PayslipFilter {
  page: number;
  pageSize: number;
  month?: number;
  year?: number;
  employeeId?: string;
}
