import { IAM_MODULES, IamAction } from '../iam/iam.constants';

export function userPermission(action: IamAction): string {
  return `${IAM_MODULES.USERS}.${IAM_MODULES.USERS}.${action}`;
}

export const USER_PERMISSIONS = {
  CREATE: userPermission('Create'),
  READ: userPermission('Read'),
  UPDATE: userPermission('Update'),
  DELETE: userPermission('Delete'),
  EXPORT: userPermission('Export'),
  APPROVE: userPermission('Approve'),
} as const;
