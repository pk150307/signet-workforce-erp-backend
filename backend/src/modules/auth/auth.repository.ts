import { query } from '../../database/pool';

export interface DbUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  profile_photo_url: string | null;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  refresh_token: string | null;
  refresh_token_expiry: Date | null;
}

export class AuthRepository {
  async findByEmail(email: string): Promise<DbUser | null> {
    const { rows } = await query<DbUser>(
      `SELECT id, username, email, password_hash, full_name, profile_photo_url,
              is_active, failed_login_attempts, locked_until, refresh_token, refresh_token_expiry
       FROM users WHERE email = $1 AND NOT is_deleted`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findByRefreshToken(refreshToken: string): Promise<DbUser | null> {
    const { rows } = await query<DbUser>(
      `SELECT id, username, email, password_hash, full_name, profile_photo_url,
              is_active, failed_login_attempts, locked_until, refresh_token, refresh_token_expiry
       FROM users
       WHERE refresh_token = $1 AND refresh_token_expiry > NOW() AND NOT is_deleted`,
      [refreshToken],
    );
    return rows[0] ?? null;
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const { rows } = await query<{ name: string }>(
      `SELECT r.name FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND NOT ur.is_deleted AND r.is_active`,
      [userId],
    );
    return rows.map((r) => r.name);
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const { rows } = await query<{ permission_name: string }>(
      `SELECT DISTINCT p.module || '.' || p.resource || '.' || p.action AS permission_name
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1 AND NOT ur.is_deleted`,
      [userId],
    );
    return rows.map((r) => r.permission_name);
  }

  async updateLoginSuccess(userId: string, refreshToken: string, refreshExpiry: Date): Promise<void> {
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(),
              refresh_token = $2, refresh_token_expiry = $3, updated_at = NOW()
       WHERE id = $1`,
      [userId, refreshToken, refreshExpiry],
    );
  }

  async updateLoginFailure(userId: string, attempts: number, lockedUntil: Date | null): Promise<void> {
    await query(
      `UPDATE users SET failed_login_attempts = $2, locked_until = $3, updated_at = NOW() WHERE id = $1`,
      [userId, attempts, lockedUntil],
    );
  }

  async updateRefreshToken(userId: string, refreshToken: string, refreshExpiry: Date): Promise<void> {
    await query(
      `UPDATE users SET refresh_token = $2, refresh_token_expiry = $3, updated_at = NOW() WHERE id = $1`,
      [userId, refreshToken, refreshExpiry],
    );
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await query(
      `UPDATE users SET refresh_token = NULL, refresh_token_expiry = NULL, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await query(
      `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [userId, passwordHash],
    );
  }
}

export const authRepository = new AuthRepository();
