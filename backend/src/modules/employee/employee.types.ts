import {
  EmployeeDocumentType,
  EmployeeHistoryEventType,
  EmployeeLifecycleStatus,
  EmployeeActivityType,
  EmploymentType,
  Gender,
} from './employee.constants';

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  siteName: string | null;
  status: EmployeeLifecycleStatus;
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
  status: EmployeeLifecycleStatus;
  employmentType: EmploymentType;
  departmentId: string;
  departmentCode?: string | null;
  departmentName: string;
  designationId: string;
  designationCode?: string | null;
  designationName: string;
  designationGradeId: string | null;
  gradeCode: string | null;
  gradeName: string | null;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  siteId: string | null;
  siteName: string | null;
  clientId: string | null;
  clientName: string | null;
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
  ctc: number | null;
  shiftId: string | null;
  draftStep: number;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface EmployeeProfile extends EmployeeDetail {
  attendanceSummary: {
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    workingDays: number;
  };
  payrollSummary: {
    lastProcessedMonth: number | null;
    lastProcessedYear: number | null;
    lastNetSalary: number | null;
    ytdGross: number;
  };
  leaveSummary: {
    approvedDays: number;
    pendingRequests: number;
  };
  documents: EmployeeDocumentItem[];
  history: EmployeeTimelineItem[];
  timeline: EmployeeTimelineItem[];
}

export interface EmployeeDocumentItem {
  id: string;
  type: EmployeeDocumentType;
  label: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  version: number;
  uploadedAt: string;
}

export type DocumentDownloadSource = 'disk' | 's3' | 'url';

export interface DocumentDownloadInfo {
  fileName: string;
  mimeType: string;
  source: DocumentDownloadSource;
  diskPath?: string;
  s3Key?: string;
  url?: string;
}

export interface EmployeeTimelineItem {
  id: string;
  eventType: EmployeeHistoryEventType;
  title: string;
  description: string | null;
  performedBy: string;
  performedAt: string;
  metadata: Record<string, unknown>;
}

export interface EmployeeActivity {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  type: EmployeeActivityType;
  description: string;
  performedBy: string;
  performedAt: string;
}

export interface EmployeeDashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  leftEmployees: number;
  draftEmployees: number;
  newJoinersThisMonth: number;
  exitsThisMonth: number;
  departmentDistribution: { department: string; count: number }[];
  headcountTrend: { month: string; joiners: number; exits: number }[];
}

export interface EmployeeFilter {
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  designationId?: string;
  siteId?: string;
  clientId?: string;
  status?: EmployeeLifecycleStatus | 'all';
  employmentType?: EmploymentType;
  sortBy?: string;
  sortDir?: string;
}

export interface SaveEmployeeDraftInput {
  id?: string;
  employeeCode?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string;
  dateOfBirth?: string;
  gender?: Gender;
  joiningDate?: string;
  employmentType?: EmploymentType;
  departmentId?: string;
  designationId?: string;
  designationGradeId?: string;
  reportingManagerId?: string;
  siteId?: string;
  clientId?: string;
  shiftId?: string;
  presentAddress?: string;
  permanentAddress?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  basicSalary?: number;
  grossSalary?: number;
  ctc?: number;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  pfNumber?: string;
  esiNumber?: string;
  esicNumber?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  uanNumber?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  draftStep?: number;
  createdBy: string;
}

export interface CreateEmployeeInput extends SaveEmployeeDraftInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: Gender;
  joiningDate: string;
  employmentType: EmploymentType;
  departmentId: string;
  designationId: string;
  basicSalary: number;
  grossSalary: number;
}

export interface UpdateEmployeeInput extends SaveEmployeeDraftInput {
  id: string;
  status?: EmployeeLifecycleStatus;
}

export interface MarkLeftInput {
  employeeId: string;
  lastWorkingDate: string;
  reason: string;
  remarks?: string;
  changedBy: string;
}

export interface RejoinEmployeeInput {
  employeeId: string;
  joiningDate: string;
  departmentId: string;
  designationId: string;
  siteId?: string;
  reportingManagerId?: string;
  reuseEmployeeCode: boolean;
  basicSalary?: number;
  grossSalary?: number;
  changedBy: string;
}

export interface BulkImportRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: number;
  joiningDate: string;
  employmentType: number;
  departmentId: string;
  designationId: string;
  basicSalary: number;
  grossSalary: number;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export interface EmployeeCodeResult {
  code: string;
}

export interface EmployeeSubmitResult {
  id: string;
  employeeCode: string;
  status: EmployeeLifecycleStatus;
  fullName: string;
}

export interface CreateEmployeeResult {
  id: string;
  employeeCode: string;
}
