import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { USER_STATUS } from '../iam/iam.constants';
import {
  CreateUserInput,
  UpdateUserInput,
  UpdateUserStatusInput,
  UserDetail,
  UserFilter,
  UserListItem,
} from './users.types';

const USER_SELECT = `
  u.id, u.username, u.email, u.first_name, u.last_name, u.full_name, u.mobile,
  u.profile_photo_url, u.employee_id, u.department_id, u.is_active, u.status,
  u.is_email_verified, u.last_login_at, u.last_login_ip, u.failed_login_attempts,
  u.locked_until, u.account_locked, u.password_expires_at, u.force_password_reset,
  u.created_at, u.created_by, u.updated_at, u.updated_by,
  d.name AS department_name,
  e.employee_code
`;

export class UsersRepository {
  async findAll(filter: UserFilter): Promise<PaginatedResult<UserListItem>> {
    const conditions = ['NOT u.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.search) {
      conditions.push(
        `(LOWER(u.email) LIKE $${i} OR LOWER(u.username) LIKE $${i}
          OR LOWER(COALESCE(u.first_name, '')) LIKE $${i}
          OR LOWER(COALESCE(u.last_name, '')) LIKE $${i}
          OR LOWER(COALESCE(u.full_name, '')) LIKE $${i}
          OR COALESCE(u.mobile, '') LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`u.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    if (filter.status) {
      conditions.push(`u.status = $${i++}`);
      params.push(filter.status);
    }

    if (filter.departmentId) {
      conditions.push(`u.department_id = $${i++}`);
      params.push(filter.departmentId);
    }

    if (filter.roleId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = u.id AND ur.role_id = $${i} AND NOT ur.is_deleted
      )`);
      params.push(filter.roleId);
      i++;
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT u.id) AS count FROM users u WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${USER_SELECT},
              COALESCE(
                array_agg(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL AND NOT r.is_deleted),
                '{}'
              ) AS role_names
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id AND NOT d.is_deleted
       LEFT JOIN employees e ON e.id = u.employee_id AND NOT e.is_deleted
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND NOT ur.is_deleted
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ${where}
       GROUP BY u.id, d.name, e.employee_code
       ORDER BY u.created_at DESC
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

  async findById(id: string): Promise<UserDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${USER_SELECT},
              COALESCE(
                array_agg(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL AND NOT r.is_deleted),
                '{}'
              ) AS role_names,
              COALESCE(
                array_agg(DISTINCT r.id) FILTER (WHERE r.id IS NOT NULL AND NOT r.is_deleted),
                '{}'
              ) AS role_ids
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id AND NOT d.is_deleted
       LEFT JOIN employees e ON e.id = u.employee_id AND NOT e.is_deleted
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND NOT ur.is_deleted
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 AND NOT u.is_deleted
       GROUP BY u.id, d.name, e.employee_code`,
      [id],
    );
    if (!rows[0]) return null;
    return this.mapDetail(rows[0]);
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const params: unknown[] = [email.toLowerCase()];
    let sql = 'SELECT 1 FROM users WHERE LOWER(email) = $1 AND NOT is_deleted';
    if (excludeId) {
      params.push(excludeId);
      sql += ' AND id <> $2';
    }
    const { rows } = await query(sql, params);
    return rows.length > 0;
  }

  async usernameExists(username: string, excludeId?: string): Promise<boolean> {
    const params: unknown[] = [username.toLowerCase()];
    let sql = 'SELECT 1 FROM users WHERE LOWER(username) = $1 AND NOT is_deleted';
    if (excludeId) {
      params.push(excludeId);
      sql += ' AND id <> $2';
    }
    const { rows } = await query(sql, params);
    return rows.length > 0;
  }

  async create(
    input: CreateUserInput & { username: string; passwordHash: string; passwordExpiresAt: Date },
  ): Promise<string> {
    const fullName = `${input.firstName} ${input.lastName}`.trim();
    const { rows } = await query<{ id: string }>(
      `INSERT INTO users (
        username, email, password_hash, first_name, last_name, full_name, mobile,
        employee_id, department_id, profile_photo_url, is_active, status,
        force_password_reset, password_expires_at, is_email_verified, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,FALSE,$15)
      RETURNING id`,
      [
        input.username,
        input.email.toLowerCase(),
        input.passwordHash,
        input.firstName,
        input.lastName,
        fullName,
        input.mobile ?? null,
        input.employeeId ?? null,
        input.departmentId ?? null,
        input.profilePhotoUrl ?? null,
        input.isActive ?? true,
        input.isActive === false ? USER_STATUS.INACTIVE : USER_STATUS.ACTIVE,
        input.forcePasswordReset ?? true,
        input.passwordExpiresAt ?? null,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async update(input: UpdateUserInput): Promise<void> {
    const fields: string[] = [];
    const params: unknown[] = [input.id];
    let i = 2;

    if (input.email !== undefined) {
      fields.push(`email = $${i++}`);
      params.push(input.email.toLowerCase());
    }
    if (input.firstName !== undefined) {
      fields.push(`first_name = $${i++}`);
      params.push(input.firstName);
    }
    if (input.lastName !== undefined) {
      fields.push(`last_name = $${i++}`);
      params.push(input.lastName);
    }
    if (input.firstName !== undefined || input.lastName !== undefined) {
      const user = await this.findById(input.id);
      const firstName = input.firstName ?? user?.firstName ?? '';
      const lastName = input.lastName ?? user?.lastName ?? '';
      fields.push(`full_name = $${i++}`);
      params.push(`${firstName} ${lastName}`.trim());
    }
    if (input.mobile !== undefined) {
      fields.push(`mobile = $${i++}`);
      params.push(input.mobile);
    }
    if (input.employeeId !== undefined) {
      fields.push(`employee_id = $${i++}`);
      params.push(input.employeeId);
    }
    if (input.departmentId !== undefined) {
      fields.push(`department_id = $${i++}`);
      params.push(input.departmentId);
    }
    if (input.profilePhotoUrl !== undefined) {
      fields.push(`profile_photo_url = $${i++}`);
      params.push(input.profilePhotoUrl);
    }
    if (input.isActive !== undefined) {
      fields.push(`is_active = $${i++}`);
      params.push(input.isActive);
      fields.push(`status = $${i++}`);
      params.push(input.isActive ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE);
    }

    fields.push(`updated_at = NOW()`, `updated_by = $${i++}`);
    params.push(input.updatedBy);

    if (fields.length > 2) {
      await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $1 AND NOT is_deleted`, params);
    }
  }

  async updateStatus(input: UpdateUserStatusInput): Promise<void> {
    const unlock = input.unlockAccount ?? false;
    await query(
      `UPDATE users SET
        is_active = $2,
        status = $3,
        failed_login_attempts = CASE WHEN $4 THEN 0 ELSE failed_login_attempts END,
        locked_until = CASE WHEN $4 THEN NULL ELSE locked_until END,
        account_locked = CASE WHEN $4 THEN FALSE ELSE account_locked END,
        updated_at = NOW(),
        updated_by = $5
       WHERE id = $1 AND NOT is_deleted`,
      [
        input.id,
        input.isActive,
        input.isActive ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE,
        unlock,
        input.updatedBy,
      ],
    );
  }

  async setRoles(userId: string, roleIds: string[], createdBy: string): Promise<void> {
    await query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    for (const roleId of roleIds) {
      await query(
        `INSERT INTO user_roles (user_id, role_id, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_id) DO UPDATE
         SET is_deleted = FALSE, updated_at = NOW(), updated_by = EXCLUDED.created_by`,
        [userId, roleId, createdBy],
      );
    }
  }

  async getRoleNames(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const { rows } = await query<{ name: string }>(
      `SELECT name FROM roles WHERE id = ANY($1::uuid[]) AND NOT is_deleted`,
      [roleIds],
    );
    return rows.map((r) => r.name);
  }

  async countActiveSuperAdmins(excludeUserId?: string): Promise<number> {
    const params: unknown[] = ['Super Admin'];
    let sql = `
      SELECT COUNT(DISTINCT u.id)::int AS count
      FROM users u
      INNER JOIN user_roles ur ON ur.user_id = u.id AND NOT ur.is_deleted
      INNER JOIN roles r ON r.id = ur.role_id AND r.name = $1 AND NOT r.is_deleted
      WHERE u.is_active AND NOT u.is_deleted`;
    if (excludeUserId) {
      params.push(excludeUserId);
      sql += ' AND u.id <> $2';
    }
    const { rows } = await query<{ count: number }>(sql, params);
    return rows[0]?.count ?? 0;
  }

  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const { rows } = await query(
      `SELECT 1 FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND r.name = $2 AND NOT ur.is_deleted AND NOT r.is_deleted`,
      [userId, roleName],
    );
    return rows.length > 0;
  }

  private mapListItem(r: Record<string, unknown>): UserListItem {
    return {
      id: String(r.id),
      username: String(r.username),
      email: String(r.email),
      firstName: r.first_name ? String(r.first_name) : null,
      lastName: r.last_name ? String(r.last_name) : null,
      fullName: r.full_name ? String(r.full_name) : null,
      mobile: r.mobile ? String(r.mobile) : null,
      roles: Array.isArray(r.role_names) ? (r.role_names as string[]) : [],
      departmentId: r.department_id ? String(r.department_id) : null,
      departmentName: r.department_name ? String(r.department_name) : null,
      employeeId: r.employee_id ? String(r.employee_id) : null,
      employeeCode: r.employee_code ? String(r.employee_code) : null,
      isActive: Boolean(r.is_active),
      status: String(r.status),
      accountLocked: Boolean(r.account_locked),
      lastLoginAt: r.last_login_at ? new Date(String(r.last_login_at)).toISOString() : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      createdBy: String(r.created_by),
    };
  }

  private mapDetail(r: Record<string, unknown>): UserDetail {
    const list = this.mapListItem(r);
    return {
      ...list,
      profilePhotoUrl: r.profile_photo_url ? String(r.profile_photo_url) : null,
      isEmailVerified: Boolean(r.is_email_verified),
      lastLoginIp: r.last_login_ip ? String(r.last_login_ip) : null,
      failedLoginAttempts: Number(r.failed_login_attempts ?? 0),
      lockedUntil: r.locked_until ? new Date(String(r.locked_until)).toISOString() : null,
      passwordExpiresAt: r.password_expires_at
        ? new Date(String(r.password_expires_at)).toISOString()
        : null,
      forcePasswordReset: Boolean(r.force_password_reset),
      roleIds: Array.isArray(r.role_ids) ? (r.role_ids as string[]) : [],
      updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
      updatedBy: r.updated_by ? String(r.updated_by) : null,
    };
  }
}

export const usersRepository = new UsersRepository();
