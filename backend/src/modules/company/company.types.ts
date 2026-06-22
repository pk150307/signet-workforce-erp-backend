export interface CompanyProfile {
  id: string;
  companyName: string;
  legalName: string;
  registrationNumber: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  email: string;
  phone: string;
  website: string | null;
  address: string;
  city: string;
  state: string;
  pinCode: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPinCode: string | null;
  logoUrl: string | null;
}

export interface UpdateCompanyProfileInput {
  companyName: string;
  legalName: string;
  registrationNumber?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  email: string;
  phone: string;
  website?: string | null;
  address: string;
  city: string;
  state: string;
  pinCode?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPinCode?: string | null;
  logoUrl?: string | null;
  updatedBy: string;
}

export interface BranchListItem {
  id: string;
  branchCode: string;
  branchName: string;
  city: string | null;
  state: string | null;
  headCount: number;
  isActive: boolean;
}

export interface OfficeListItem {
  id: string;
  officeCode: string;
  officeName: string;
  branchName: string;
  floor: string | null;
  capacity: number;
  isActive: boolean;
}

export interface CompanyListFilter {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
}
