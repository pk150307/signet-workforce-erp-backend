export interface PfEsicListItem {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  department: string;
  designation: string;
  siteName: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  uanNumber: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  isPfApplicable: boolean;
  isEsiApplicable: boolean;
  pfJoiningDate: string | null;
  esiJoiningDate: string | null;
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
  page: number;
  pageSize: number;
  search?: string;
  siteId?: string;
  pfApplicable?: boolean;
  esiApplicable?: boolean;
}
