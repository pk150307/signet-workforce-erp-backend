/** IAM status and type constants aligned with migration 020_iam_schema.sql */

export const IAM_SYSTEM_ROLES = {
  SUPER_ADMIN: 'Super Admin',
  HR_MANAGER: 'HR Manager',
} as const;

export type IamSystemRole = (typeof IAM_SYSTEM_ROLES)[keyof typeof IAM_SYSTEM_ROLES];

export const IAM_MODULES = {
  USERS: 'Users',
  ROLES: 'Roles',
  DELETE_REQUESTS: 'DeleteRequests',
  AUDIT: 'Audit',
  EMPLOYEES: 'Employees',
  CLIENTS: 'Clients',
  SITES: 'Sites',
  ATTENDANCE: 'Attendance',
  LEAVE: 'Leave',
  PAYROLL: 'Payroll',
  BILLING: 'Billing',
  REPORTS: 'Reports',
  SETTINGS: 'Settings',
  DASHBOARD: 'Dashboard',
} as const;

export const IAM_ACTIONS = ['Create', 'Read', 'Update', 'Delete', 'Export', 'Approve'] as const;
export type IamAction = (typeof IAM_ACTIONS)[number];

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
} as const;

export const LOGIN_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  LOCKED: 'locked',
  LOGOUT: 'logout',
} as const;

export const DELETE_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

export const NOTIFICATION_TYPE = {
  DELETE_REQUEST_SUBMITTED: 'delete_request_submitted',
  DELETE_APPROVED: 'delete_approved',
  DELETE_REJECTED: 'delete_rejected',
  PASSWORD_RESET: 'password_reset',
  USER_CREATED: 'user_created',
  ROLE_CHANGED: 'role_changed',
  LOGIN_NEW_DEVICE: 'login_new_device',
} as const;

export const NOTIFICATION_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
} as const;

export const AUDIT_ACTION = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  FORGOT_PASSWORD: 'forgot_password',
  RESET_PASSWORD: 'reset_password',
  USER_CREATE: 'user_create',
  USER_UPDATE: 'user_update',
  ROLE_CHANGE: 'role_change',
  PERMISSION_CHANGE: 'permission_change',
  DELETE_REQUEST: 'delete_request',
  DELETE_APPROVE: 'delete_approve',
  DELETE_REJECT: 'delete_reject',
  RECORD_DELETE: 'record_delete',
  PROFILE_UPDATE: 'profile_update',
} as const;

/** Default password reset token validity (minutes). */
export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

/** Max failed login attempts before account lock. */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Account lock duration after max failed attempts (minutes). */
export const ACCOUNT_LOCK_DURATION_MINUTES = 30;
