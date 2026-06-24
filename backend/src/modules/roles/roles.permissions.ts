import { IAM_MODULES, IamAction } from '../iam/iam.constants';

export function rolePermission(action: IamAction): string {
  return `${IAM_MODULES.ROLES}.${IAM_MODULES.ROLES}.${action}`;
}

export const ROLE_PERMISSIONS = {
  CREATE: rolePermission('Create'),
  READ: rolePermission('Read'),
  UPDATE: rolePermission('Update'),
  DELETE: rolePermission('Delete'),
  EXPORT: rolePermission('Export'),
  APPROVE: rolePermission('Approve'),
} as const;

export function permissionKey(module: string, resource: string, action: string): string {
  return `${module}.${resource}.${action}`;
}
