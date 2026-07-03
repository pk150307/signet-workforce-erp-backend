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

export const EMPLOYEE_CODE_PREFIX = 'SS-';
export const EMPLOYEE_CODE_PAD_LENGTH = 5;

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

export const BULK_EXPORT_HEADERS = [
  'employeeCode',
  'firstName',
  'lastName',
  'email',
  'phone',
  'status',
  'department',
  'designation',
  'site',
  'joiningDate',
  'basicSalary',
  'grossSalary',
] as const;
