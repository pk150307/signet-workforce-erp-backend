import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { permissionKey } from './roles.permissions';
import {
  CreateRoleInput,
  PermissionFilter,
  PermissionItem,
  PermissionModuleGroup,
  RoleDetail,
  RoleFilter,
  RoleListItem,
  UpdateRoleInput,
} from './roles.types';

export class RolesRepository {
  async findAll(filter: RoleFilter): Promise<PaginatedResult<RoleListItem>> {
    const conditions = ['NOT r.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.search) {
      conditions.push(`(LOWER(r.name) LIKE $${i} OR LOWER(COALESCE(r.description, '')) LIKE $${i})`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`r.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    if (filter.isSystem !== undefined) {
      conditions.push(`r.is_system = $${i++}`);
      params.push(filter.isSystem);
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM roles r WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT r.id, r.name, r.description, r.is_system, r.is_active, r.status,
              r.created_at, r.created_by,
              (SELECT COUNT(*)::int FROM role_permissions rp
               WHERE rp.role_id = r.id AND NOT rp.is_deleted) AS permission_count,
              (SELECT COUNT(DISTINCT ur.user_id)::int FROM user_roles ur
               INNER JOIN users u ON u.id = ur.user_id AND NOT u.is_deleted
               WHERE ur.role_id = r.id AND NOT ur.is_deleted) AS user_count
       FROM roles r
       WHERE ${where}
       ORDER BY r.is_system DESC, r.name ASC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map((r) => this.mapListItem(r)),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async findById(id: string): Promise<RoleDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT r.id, r.name, r.description, r.is_system, r.is_active, r.status,
              r.created_at, r.created_by, r.updated_at, r.updated_by,
              (SELECT COUNT(*)::int FROM role_permissions rp
               WHERE rp.role_id = r.id AND NOT rp.is_deleted) AS permission_count,
              (SELECT COUNT(DISTINCT ur.user_id)::int FROM user_roles ur
               INNER JOIN users u ON u.id = ur.user_id AND NOT u.is_deleted
               WHERE ur.role_id = r.id AND NOT ur.is_deleted) AS user_count
       FROM roles r
       WHERE r.id = $1 AND NOT r.is_deleted`,
      [id],
    );
    if (!rows[0]) return null;

    const permissions = await this.getRolePermissions(id);
    const detail = this.mapDetail(rows[0]);
    detail.permissions = permissions;
    detail.permissionIds = permissions.map((p) => p.id);
    return detail;
  }

  async findByName(name: string, excludeId?: string): Promise<boolean> {
    const params: unknown[] = [name];
    let sql = 'SELECT 1 FROM roles WHERE LOWER(name) = LOWER($1) AND NOT is_deleted';
    if (excludeId) {
      params.push(excludeId);
      sql += ' AND id <> $2';
    }
    const { rows } = await query(sql, params);
    return rows.length > 0;
  }

  async create(input: CreateRoleInput): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO roles (name, description, is_system, is_active, status, created_by)
       VALUES ($1, $2, FALSE, $3, $4, $5)
       RETURNING id`,
      [
        input.name.trim(),
        input.description ?? null,
        input.isActive ?? true,
        input.isActive === false ? 'inactive' : 'active',
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async update(input: UpdateRoleInput): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [input.id];
    let i = 2;

    if (input.name !== undefined) {
      fields.push(`name = $${i++}`);
      params.push(input.name.trim());
    }
    if (input.description !== undefined) {
      fields.push(`description = $${i++}`);
      params.push(input.description);
    }
    if (input.isActive !== undefined) {
      fields.push(`is_active = $${i++}`);
      params.push(input.isActive);
      fields.push(`status = $${i++}`);
      params.push(input.isActive ? 'active' : 'inactive');
    }

    fields.push(`updated_at = NOW()`, `updated_by = $${i++}`);
    params.push(input.updatedBy);

    await query(`UPDATE roles SET ${fields.join(', ')} WHERE id = $1 AND NOT is_deleted`, params);
  }

  async setPermissions(roleId: string, permissionIds: string[], updatedBy: string): Promise<void> {
    await query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    for (const permissionId of permissionIds) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_id) DO UPDATE
         SET is_deleted = FALSE, updated_at = NOW(), updated_by = EXCLUDED.created_by`,
        [roleId, permissionId, updatedBy],
      );
    }
  }

  async findAllPermissions(filter: PermissionFilter): Promise<PermissionItem[] | PermissionModuleGroup[]> {
    const conditions = ['NOT is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.module) {
      conditions.push(`module = $${i++}`);
      params.push(filter.module);
    }

    const where = conditions.join(' AND ');
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, module, resource, action, description
       FROM permissions
       WHERE ${where}
       ORDER BY module, resource, action`,
      params,
    );

    const items = rows.map((r) => this.mapPermission(r));

    if (!filter.groupByModule) {
      return items;
    }

    const grouped = new Map<string, PermissionItem[]>();
    for (const item of items) {
      const list = grouped.get(item.module) ?? [];
      list.push(item);
      grouped.set(item.module, list);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, permissions]) => ({ module, permissions }));
  }

  async getRolePermissions(roleId: string): Promise<PermissionItem[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT p.id, p.module, p.resource, p.action, p.description
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id AND NOT rp.is_deleted
       WHERE rp.role_id = $1 AND NOT p.is_deleted
       ORDER BY p.module, p.resource, p.action`,
      [roleId],
    );
    return rows.map((r) => this.mapPermission(r));
  }

  async validatePermissionIds(permissionIds: string[]): Promise<boolean> {
    if (permissionIds.length === 0) return true;
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM permissions
       WHERE id = ANY($1::uuid[]) AND NOT is_deleted`,
      [permissionIds],
    );
    return parseInt(rows[0].count, 10) === permissionIds.length;
  }

  async getPermissionKeys(permissionIds: string[]): Promise<string[]> {
    if (permissionIds.length === 0) return [];
    const { rows } = await query<{ module: string; resource: string; action: string }>(
      `SELECT module, resource, action FROM permissions
       WHERE id = ANY($1::uuid[]) AND NOT is_deleted`,
      [permissionIds],
    );
    return rows.map((r) => permissionKey(r.module, r.resource, r.action));
  }

  private mapPermission(r: Record<string, unknown>): PermissionItem {
    const module = String(r.module);
    const resource = String(r.resource);
    const action = String(r.action);
    return {
      id: String(r.id),
      module,
      resource,
      action,
      key: permissionKey(module, resource, action),
      description: r.description ? String(r.description) : null,
    };
  }

  private mapListItem(r: Record<string, unknown>): RoleListItem {
    return {
      id: String(r.id),
      name: String(r.name),
      description: r.description ? String(r.description) : null,
      isSystem: Boolean(r.is_system),
      isActive: Boolean(r.is_active),
      status: String(r.status),
      permissionCount: Number(r.permission_count ?? 0),
      userCount: Number(r.user_count ?? 0),
      createdAt: new Date(String(r.created_at)).toISOString(),
      createdBy: String(r.created_by),
    };
  }

  private mapDetail(r: Record<string, unknown>): RoleDetail {
    return {
      ...this.mapListItem(r),
      permissionIds: [],
      permissions: [],
      updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
      updatedBy: r.updated_by ? String(r.updated_by) : null,
    };
  }
}

export const rolesRepository = new RolesRepository();
