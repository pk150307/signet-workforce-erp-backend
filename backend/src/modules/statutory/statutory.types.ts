export type PfEsicStatus = 'Active' | 'Inactive' | 'Pending' | 'Suspended';

export type EmployeeStatusFilter = number | 'all';

export interface PfEsicListItem {
  id: string;
  employeeId: string;
  employeeCode: string;
  softCode: string | null;
  fullName: string;
  fatherName: string | null;
  department: string;
  designation: string;
  clientCompanyName: string | null;
  siteName: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  uanNumber: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  esicNumber: string | null;
  isPfApplicable: boolean;
  isEsiApplicable: boolean;
  pfJoiningDate: string | null;
  esiJoiningDate: string | null;
  effectiveDate: string | null;
  status: PfEsicStatus;
}

export interface PfEsicDetail extends PfEsicListItem {
  pfExitDate: string | null;
  pfNomineeName: string | null;
  pfNomineeRelation: string | null;
  pfAccountNumber: string | null;
  employerPfPercentage: number;
  employeePfPercentage: number;
  pfRemarks: string | null;
  esiDispensary: string | null;
  esiExitDate: string | null;
  employerEsiPercentage: number;
  employeeEsiPercentage: number;
  familyMembers: FamilyMember[];
  esiRemarks: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
}

export interface FamilyMember {
  name: string;
  relation: string;
  dateOfBirth?: string;
  aadhaarNumber?: string;
}

export interface UpsertPfEsicInput {
  employeeId: string;
  effectiveDate?: string | null;
  status?: PfEsicStatus | string | null;
  uanNumber?: string | null;
  pfNumber?: string | null;
  pfJoiningDate?: string | null;
  pfExitDate?: string | null;
  pfNomineeName?: string | null;
  pfNomineeRelation?: string | null;
  pfAccountNumber?: string | null;
  employerPfPercentage?: number;
  employeePfPercentage?: number;
  isPfApplicable?: boolean;
  pfRemarks?: string | null;
  esiNumber?: string | null;
  esiDispensary?: string | null;
  esiJoiningDate?: string | null;
  esiExitDate?: string | null;
  isEsiApplicable?: boolean;
  employerEsiPercentage?: number;
  employeeEsiPercentage?: number;
  familyMembers?: FamilyMember[];
  esiRemarks?: string | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  updatedBy: string;
}

export interface StatutoryFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  page?: number;
  search?: string;
  siteId?: string;
  clientId?: string;
  status?: PfEsicStatus;
  employeeStatus?: EmployeeStatusFilter;
  department?: string;
  hasUan?: boolean;
  hasEsic?: boolean;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  pfApplicable?: boolean;
  esiApplicable?: boolean;
}

export const PF_ESIC_EXPORT_COLUMNS = [
  { key: 'employeeCode', label: 'Employee Code' },
  { key: 'softCode', label: 'Soft Code' },
  { key: 'fullName', label: 'Full Name' },
  { key: 'fatherName', label: 'Father Name' },
  { key: 'client', label: 'Client' },
  { key: 'designation', label: 'Designation' },
  { key: 'site', label: 'Site' },
  { key: 'aadhaarNumber', label: 'Aadhaar Number' },
  { key: 'uanNumber', label: 'UAN Number' },
  { key: 'esicNumber', label: 'ESIC Number' },
  { key: 'panNumber', label: 'PAN Number' },
  { key: 'status', label: 'Status' },
  { key: 'effectiveDate', label: 'Effective Date' },
] as const;

export const PF_ESIC_EXPORT_HEADERS = PF_ESIC_EXPORT_COLUMNS.map((column) => column.label);

/** PDF drops Status / Effective Date so identity numbers stay on one line. */
export const PF_ESIC_PDF_OMIT_HEADERS = ['Status', 'Effective Date'] as const;
