import { IAM_MODULES, IamAction } from '../iam/iam.constants';

export function auditLogPermission(action: IamAction): string {
  return `${IAM_MODULES.AUDIT}.${IAM_MODULES.AUDIT}.${action}`;
}

export const AUDIT_LOG_PERMISSIONS = {
  CREATE: auditLogPermission('Create'),
  READ: auditLogPermission('Read'),
  UPDATE: auditLogPermission('Update'),
  DELETE: auditLogPermission('Delete'),
  EXPORT: auditLogPermission('Export'),
  APPROVE: auditLogPermission('Approve'),
} as const;
