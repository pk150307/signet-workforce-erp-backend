export interface RoleListItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  status: string;
  permissionCount: number;
  userCount: number;
  createdAt: string;
  createdBy: string;
}

export interface PermissionItem {
  id: string;
  module: string;
  resource: string;
  action: string;
  key: string;
  description: string | null;
}

export interface PermissionModuleGroup {
  module: string;
  permissions: PermissionItem[];
}

export interface RoleDetail extends RoleListItem {
  permissionIds: string[];
  permissions: PermissionItem[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface RoleFilter {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  isSystem?: boolean;
}

export interface CreateRoleInput {
  name: string;
  description?: string | null;
  isActive?: boolean;
  permissionIds?: string[];
  createdBy: string;
}

export interface UpdateRoleInput {
  id: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  updatedBy: string;
}

export interface UpdateRolePermissionsInput {
  roleId: string;
  permissionIds: string[];
  updatedBy: string;
}

export interface PermissionFilter {
  module?: string;
  groupByModule?: boolean;
}
