import { IAM_MODULES, IamAction } from '../iam/iam.constants';

export function deleteRequestPermission(action: IamAction): string {
  return `${IAM_MODULES.DELETE_REQUESTS}.${IAM_MODULES.DELETE_REQUESTS}.${action}`;
}

export const DELETE_REQUEST_PERMISSIONS = {
  CREATE: deleteRequestPermission('Create'),
  READ: deleteRequestPermission('Read'),
  UPDATE: deleteRequestPermission('Update'),
  DELETE: deleteRequestPermission('Delete'),
  EXPORT: deleteRequestPermission('Export'),
  APPROVE: deleteRequestPermission('Approve'),
} as const;

export function deleteEntityKey(module: string, entityType: string): string {
  return `${module}.${entityType}`;
}
