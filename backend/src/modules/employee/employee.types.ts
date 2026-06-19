import {
  EmployeeStatus,
  EmploymentType,
  Gender,
} from '../../types/enums';

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  siteName: string | null;
  status: EmployeeStatus;
  joiningDate: string;
  profilePhotoUrl: string | null;
}

export interface EmployeeDetail {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  alternatePhone: string | null;
  dateOfBirth: string;
  gender: Gender;
  profilePhotoUrl: string | null;
  joiningDate: string;
  confirmationDate: string | null;
  resignationDate: string | null;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationName: string;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  siteId: string | null;
  siteName: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  city: string | null;
  state: string | null;
  pinCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  accountHolderName: string | null;
  pfNumber: string | null;
  esiNumber: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  uanNumber: string | null;
  basicSalary: number;
  grossSalary: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  alternatePhone?: string;
  dateOfBirth: string;
  gender: Gender;
  joiningDate: string;
  employmentType: EmploymentType;
  departmentId: string;
  designationId: string;
  reportingManagerId?: string;
  siteId?: string;
  presentAddress?: string;
  permanentAddress?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  basicSalary: number;
  grossSalary: number;
  createdBy: string;
}

export interface UpdateEmployeeInput extends Omit<CreateEmployeeInput, 'email' | 'joiningDate'> {
  id: string;
  status: EmployeeStatus;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  pfNumber?: string;
  esiNumber?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  uanNumber?: string;
}

export interface EmployeeFilter {
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  designationId?: string;
  siteId?: string;
  status?: EmployeeStatus;
  employmentType?: EmploymentType;
  sortBy?: string;
  sortDir?: string;
}
