import { resolveExportColumns } from '../../utils/export-columns';

/** Employee lifecycle statuses — aligned with Angular frontend */
export enum EmployeeLifecycleStatus {
  Draft = 0,
  Active = 1,
  Left = 2,
  Rejoined = 3,
}

export enum EmployeeDraftStep {
  Personal = 1,
  Employment = 2,
  Statutory = 3,
  Bank = 4,
  Documents = 5,
  Review = 6,
}

export enum Gender {
  Male = 1,
  Female = 2,
  Other = 3,
  PreferNotToSay = 4,
}

export enum EmploymentType {
  FullTime = 1,
  PartTime = 2,
  Contract = 3,
  Freelance = 4,
  Internship = 5,
  Temporary = 6,
}

export type EmployeeDocumentType =
  | 'profile_photo'
  | 'aadhaar'
  | 'pan'
  | 'offer_letter'
  | 'education_certificate'
  | 'relieving_letter'
  | 'cancelled_cheque'
  | 'other';

export const EMPLOYEE_DOCUMENT_TYPES: EmployeeDocumentType[] = [
  'profile_photo',
  'aadhaar',
  'pan',
  'offer_letter',
  'education_certificate',
  'relieving_letter',
  'cancelled_cheque',
  'other',
];

export type EmployeeHistoryEventType =
  | 'created'
  | 'updated'
  | 'draft_saved'
  | 'submitted'
  | 'transferred'
  | 'promoted'
  | 'marked_left'
  | 'rejoined'
  | 'document_uploaded'
  | 'document_replaced'
  | 'document_deleted'
  | 'salary_changed'
  | 'department_changed'
  | 'designation_changed'
  | 'manager_changed'
  | 'status_changed';

export type EmployeeActivityType =
  | 'created'
  | 'updated'
  | 'marked_left'
  | 'rejoined'
  | 'document_uploaded'
  | 'draft_saved';

export const EMPLOYEE_CODE_PREFIX = 'SIG-';
export const EMPLOYEE_CODE_PAD_LENGTH = 6;

export const BULK_IMPORT_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'dateOfBirth',
  'gender',
  'joiningDate',
  'employmentType',
  'departmentId',
  'designationId',
  'basicSalary',
  'grossSalary',
] as const;

export const EMPLOYEE_EXPORT_COLUMN_DEFS = [
  { key: 'employeeCode', label: 'Employee Code' },
  { key: 'softCode', label: 'Soft Code' },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'fatherName', label: 'Father Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Mobile' },
  { key: 'uanNumber', label: 'UAN' },
  { key: 'esiNumber', label: 'ESI' },
  { key: 'aadhaarNumber', label: 'Aadhaar' },
  { key: 'bankName', label: 'Bank Name' },
  { key: 'accountNumber', label: 'Bank Account' },
  { key: 'ifscCode', label: 'IFSC' },
  { key: 'accountHolderName', label: 'Account Holder' },
  { key: 'status', label: 'Status' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'site', label: 'Site' },
  { key: 'joiningDate', label: 'Joining Date' },
  { key: 'basicSalary', label: 'Basic Salary' },
  { key: 'grossSalary', label: 'Gross Salary' },
] as const;

export type EmployeeExportColumnKey = (typeof EMPLOYEE_EXPORT_COLUMN_DEFS)[number]['key'];

export const BULK_EXPORT_HEADERS = EMPLOYEE_EXPORT_COLUMN_DEFS.map((column) => column.key);

export function resolveEmployeeExportColumns(
  requested?: string[] | null,
): Array<{ key: EmployeeExportColumnKey; label: string }> {
  return resolveExportColumns(EMPLOYEE_EXPORT_COLUMN_DEFS, requested);
}

export const EMPLOYEE_PDF_OMIT_HEADERS = ['status'] as const;
