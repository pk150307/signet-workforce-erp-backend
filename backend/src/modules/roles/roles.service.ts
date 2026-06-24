import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { IAM_SYSTEM_ROLES } from '../iam/iam.constants';
import { writeAuditLog, AUDIT_ACTION } from '../iam/audit.service';
import { rolesRepository } from './roles.repository';
import {
  CreateRoleInput,
  PermissionFilter,
  RoleDetail,
  RoleFilter,
  UpdateRoleInput,
  UpdateRolePermissionsInput,
} from './roles.types';

const ADMIN_MODULES = new Set(['Users', 'Roles', 'Audit']);

export class RolesService {
  private assertSystemRoleMutable(role: RoleDetail, action: 'rename' | 'deactivate'): void {
    if (!role.isSystem) return;

    if (action === 'rename') {
      throw new ForbiddenError('System roles cannot be renamed.');
    }
    if (action === 'deactivate') {
      throw new ForbiddenError('System roles cannot be deactivated.');
    }
  }

  private async assertSuperAdminPermissionsPreserved(
    role: RoleDetail,
    permissionIds: string[],
  ): Promise<void> {
    if (role.name !== IAM_SYSTEM_ROLES.SUPER_ADMIN) return;

    const keys = await rolesRepository.getPermissionKeys(permissionIds);
    const hasUsersRead = keys.includes('Users.Users.Read');
    const hasRolesRead = keys.includes('Roles.Roles.Read');

    if (!hasUsersRead || !hasRolesRead) {
      throw new AppError(400, 'Super Admin must retain Users.Read and Roles.Read permissions.');
    }
  }

  private async assertHrManagerScope(permissionIds: string[]): Promise<void> {
    const keys = await rolesRepository.getPermissionKeys(permissionIds);
    const forbidden = keys.filter((key) => {
      const module = key.split('.')[0];
      return ADMIN_MODULES.has(module);
    });

    if (forbidden.length > 0) {
      throw new AppError(400, 'HR Manager cannot be granted administrative module permissions.');
    }
  }

  async list(filter: RoleFilter) {
    return rolesRepository.findAll(filter);
  }

  async getById(id: string): Promise<RoleDetail> {
    const role = await rolesRepository.findById(id);
    if (!role) {
      throw new NotFoundError('Role', id);
    }
    return role;
  }

  async create(
    input: CreateRoleInput,
    actor: { userId: string; username: string },
  ): Promise<RoleDetail> {
    if (await rolesRepository.findByName(input.name)) {
      throw new ConflictError(`A role named '${input.name}' already exists.`);
    }

    if (input.permissionIds?.length) {
      const valid = await rolesRepository.validatePermissionIds(input.permissionIds);
      if (!valid) {
        throw new AppError(400, 'One or more permission ids are invalid.');
      }
    }

    const roleId = await rolesRepository.create(input);

    if (input.permissionIds?.length) {
      await rolesRepository.setPermissions(roleId, input.permissionIds, input.createdBy);
    }

    const role = (await rolesRepository.findById(roleId))!;

    await writeAuditLog({
      userId: actor.userId,
      module: 'Roles',
      action: AUDIT_ACTION.ROLE_CHANGE,
      entityType: 'role',
      entityId: roleId,
      newValues: { name: role.name, permissionCount: role.permissionCount },
      createdBy: actor.username,
    });

    return role;
  }

  async update(
    input: UpdateRoleInput,
    actor: { userId: string; username: string },
  ): Promise<RoleDetail> {
    const existing = await rolesRepository.findById(input.id);
    if (!existing) {
      throw new NotFoundError('Role', input.id);
    }

    if (input.name && input.name !== existing.name) {
      this.assertSystemRoleMutable(existing, 'rename');
      if (await rolesRepository.findByName(input.name, input.id)) {
        throw new ConflictError(`A role named '${input.name}' already exists.`);
      }
    }

    if (input.isActive === false) {
      this.assertSystemRoleMutable(existing, 'deactivate');
    }

    await rolesRepository.update(input);
    const updated = (await rolesRepository.findById(input.id))!;

    await writeAuditLog({
      userId: actor.userId,
      module: 'Roles',
      action: AUDIT_ACTION.ROLE_CHANGE,
      entityType: 'role',
      entityId: input.id,
      oldValues: {
        name: existing.name,
        description: existing.description,
        isActive: existing.isActive,
      },
      newValues: {
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
      },
      createdBy: actor.username,
    });

    return updated;
  }

  async updatePermissions(
    input: UpdateRolePermissionsInput,
    actor: { userId: string; username: string },
  ): Promise<RoleDetail> {
    const role = await rolesRepository.findById(input.roleId);
    if (!role) {
      throw new NotFoundError('Role', input.roleId);
    }

    if (input.permissionIds.length === 0) {
      throw new AppError(400, 'A role must have at least one permission.');
    }

    const valid = await rolesRepository.validatePermissionIds(input.permissionIds);
    if (!valid) {
      throw new AppError(400, 'One or more permission ids are invalid.');
    }

    await this.assertSuperAdminPermissionsPreserved(role, input.permissionIds);

    if (role.name === IAM_SYSTEM_ROLES.HR_MANAGER) {
      await this.assertHrManagerScope(input.permissionIds);
    }

    const oldKeys = role.permissions.map((p) => p.key);
    await rolesRepository.setPermissions(input.roleId, input.permissionIds, input.updatedBy);
    const updated = (await rolesRepository.findById(input.roleId))!;

    await writeAuditLog({
      userId: actor.userId,
      module: 'Roles',
      action: AUDIT_ACTION.PERMISSION_CHANGE,
      entityType: 'role',
      entityId: input.roleId,
      oldValues: { permissions: oldKeys },
      newValues: { permissions: updated.permissions.map((p) => p.key) },
      createdBy: actor.username,
    });

    return updated;
  }

  async listPermissions(filter: PermissionFilter) {
    return rolesRepository.findAllPermissions(filter);
  }
}

export const rolesService = new RolesService();
