import { query } from '../../database/pool';
import { hashToken } from '../../utils/token-hash';

export interface DbUser {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  mobile: string | null;
  profile_photo_url: string | null;
  employee_id: string | null;
  department_id: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  last_login_at: Date | null;
  last_login_ip: string | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  account_locked: boolean;
  password_expires_at: Date | null;
  force_password_reset: boolean;
  created_at: Date;
}

export interface ActiveSession {
  id: string;
  user_id: string;
  is_active: boolean;
  expires_at: Date;
  last_activity_at: Date;
}

export class AuthRepository {
  async findByEmail(email: string): Promise<DbUser | null> {
    const { rows } = await query<DbUser>(
      `SELECT id, username, email, password_hash, first_name, last_name, full_name, mobile,
              profile_photo_url, employee_id, department_id, is_active, is_email_verified,
              last_login_at, last_login_ip, failed_login_attempts, locked_until, account_locked,
              password_expires_at, force_password_reset, created_at
       FROM users WHERE LOWER(email) = LOWER($1) AND NOT is_deleted`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(userId: string): Promise<DbUser | null> {
    const { rows } = await query<DbUser>(
      `SELECT id, username, email, password_hash, first_name, last_name, full_name, mobile,
              profile_photo_url, employee_id, department_id, is_active, is_email_verified,
              last_login_at, last_login_ip, failed_login_attempts, locked_until, account_locked,
              password_expires_at, force_password_reset, created_at
       FROM users WHERE id = $1 AND NOT is_deleted`,
      [userId],
    );
    return rows[0] ?? null;
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const { rows } = await query<{ name: string }>(
      `SELECT r.name FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND NOT ur.is_deleted AND r.is_active AND NOT r.is_deleted`,
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
       WHERE ur.user_id = $1 AND NOT ur.is_deleted AND NOT rp.is_deleted AND NOT p.is_deleted`,
      [userId],
    );
    return rows.map((r) => r.permission_name);
  }

  async findActiveSession(sessionId: string): Promise<ActiveSession | null> {
    const { rows } = await query<ActiveSession>(
      `SELECT id, user_id, is_active, expires_at, last_activity_at
       FROM user_sessions
       WHERE id = $1 AND is_active AND NOT is_deleted AND expires_at > NOW()`,
      [sessionId],
    );
    return rows[0] ?? null;
  }

  async touchSession(sessionId: string): Promise<void> {
    await query(
      `UPDATE user_sessions SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [sessionId],
    );
  }

  async createSession(input: {
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    browser: string | null;
    operatingSystem: string | null;
    deviceType: string;
    expiresAt: Date;
    rememberMe: boolean;
    createdBy: string;
  }): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO user_sessions (
        user_id, ip_address, user_agent, browser, operating_system, device_type,
        expires_at, remember_me, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        input.userId,
        input.ipAddress,
        input.userAgent,
        input.browser,
        input.operatingSystem,
        input.deviceType,
        input.expiresAt,
        input.rememberMe,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async createRefreshToken(input: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
    rememberMe: boolean;
    ipAddress: string | null;
    userAgent: string | null;
    createdBy: string;
  }): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO refresh_tokens (
        user_id, session_id, token_hash, expires_at, remember_me,
        ip_address, user_agent, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id`,
      [
        input.userId,
        input.sessionId,
        input.tokenHash,
        input.expiresAt,
        input.rememberMe,
        input.ipAddress,
        input.userAgent,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async findRefreshToken(plainToken: string): Promise<{
    id: string;
    user_id: string;
    session_id: string | null;
    expires_at: Date;
    is_revoked: boolean;
  } | null> {
    const tokenHash = hashToken(plainToken);
    const { rows } = await query<{
      id: string;
      user_id: string;
      session_id: string | null;
      expires_at: Date;
      is_revoked: boolean;
    }>(
      `SELECT id, user_id, session_id, expires_at, is_revoked
       FROM refresh_tokens
       WHERE token_hash = $1 AND NOT is_deleted AND NOT is_revoked AND expires_at > NOW()`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await query(
      `UPDATE refresh_tokens
       SET is_revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [tokenId],
    );
  }

  async revokeAllUserSessions(userId: string, reason = 'logout_all'): Promise<void> {
    await query(
      `UPDATE user_sessions
       SET is_active = FALSE, ended_at = NOW(), logout_reason = $2, updated_at = NOW()
       WHERE user_id = $1 AND is_active AND NOT is_deleted`,
      [userId, reason],
    );
    await query(
      `UPDATE refresh_tokens
       SET is_revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND NOT is_revoked AND NOT is_deleted`,
      [userId],
    );
    await query(
      `UPDATE users SET refresh_token = NULL, refresh_token_expiry = NULL, updated_at = NOW()
       WHERE id = $1`,
      [userId],
    );
  }

  async endSession(sessionId: string, reason = 'logout'): Promise<void> {
    await query(
      `UPDATE user_sessions
       SET is_active = FALSE, ended_at = NOW(), logout_reason = $2, updated_at = NOW()
       WHERE id = $1`,
      [sessionId, reason],
    );
    await query(
      `UPDATE refresh_tokens
       SET is_revoked = TRUE, revoked_at = NOW(), updated_at = NOW()
       WHERE session_id = $1 AND NOT is_revoked`,
      [sessionId],
    );
  }

  async updateLoginSuccess(userId: string, ipAddress: string | null): Promise<void> {
    await query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, account_locked = FALSE,
           last_login_at = NOW(), last_login_ip = $2, updated_at = NOW()
       WHERE id = $1`,
      [userId, ipAddress],
    );
  }

  async updateLoginFailure(userId: string, attempts: number, lockedUntil: Date | null): Promise<void> {
    await query(
      `UPDATE users
       SET failed_login_attempts = $2,
           locked_until = $3::timestamptz,
           account_locked = CASE WHEN $3::timestamptz IS NOT NULL THEN TRUE ELSE account_locked END,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, attempts, lockedUntil],
    );
  }

  async recordLoginHistory(input: {
    userId: string | null;
    sessionId: string | null;
    emailAttempted: string | null;
    loginStatus: string;
    failureReason?: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    browser: string | null;
    operatingSystem: string | null;
    deviceType: string;
    isNewDevice: boolean;
  }): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO login_history (
        user_id, session_id, email_attempted, login_status, failure_reason,
        ip_address, user_agent, browser, operating_system, device_type, is_new_device, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'System')
      RETURNING id`,
      [
        input.userId,
        input.sessionId,
        input.emailAttempted,
        input.loginStatus,
        input.failureReason ?? null,
        input.ipAddress,
        input.userAgent,
        input.browser,
        input.operatingSystem,
        input.deviceType,
        input.isNewDevice,
      ],
    );
    return rows[0].id;
  }

  async hasKnownDevice(userId: string, deviceFingerprint: string): Promise<boolean> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM login_history
       WHERE user_id = $1 AND login_status = 'success'
         AND device_type = $2 AND NOT is_deleted`,
      [userId, deviceFingerprint],
    );
    return parseInt(rows[0]?.count ?? '0', 10) > 0;
  }

  async closeSessionLogin(sessionId: string): Promise<void> {
    await query(
      `UPDATE login_history
       SET logged_out_at = NOW(), updated_at = NOW()
       WHERE session_id = $1
         AND login_status = 'success'
         AND logged_out_at IS NULL
         AND NOT is_deleted`,
      [sessionId],
    );
  }

  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedIp: string | null;
  }): Promise<void> {
    await query(
      `UPDATE password_reset_tokens
       SET is_used = TRUE, used_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND NOT is_used AND NOT is_deleted`,
      [input.userId],
    );

    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip, created_by)
       VALUES ($1, $2, $3, $4, 'System')`,
      [input.userId, input.tokenHash, input.expiresAt, input.requestedIp],
    );
  }

  async findValidPasswordResetToken(plainToken: string): Promise<{ id: string; user_id: string } | null> {
    const tokenHash = hashToken(plainToken);
    const { rows } = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND NOT is_used AND NOT is_deleted AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async markPasswordResetTokenUsed(tokenId: string, usedIp: string | null): Promise<void> {
    await query(
      `UPDATE password_reset_tokens
       SET is_used = TRUE, used_at = NOW(), used_ip = $2, updated_at = NOW()
       WHERE id = $1`,
      [tokenId, usedIp],
    );
  }

  async getPasswordHistory(userId: string, limit: number): Promise<string[]> {
    const { rows } = await query<{ password_hash: string }>(
      `SELECT password_hash FROM password_history
       WHERE user_id = $1 AND NOT is_deleted
       ORDER BY changed_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => r.password_hash);
  }

  async addPasswordHistory(userId: string, passwordHash: string, changedBy: string): Promise<void> {
    await query(
      `INSERT INTO password_history (user_id, password_hash, created_by)
       VALUES ($1, $2, $3)`,
      [userId, passwordHash, changedBy],
    );
  }

  async setForcePasswordReset(userId: string, value: boolean): Promise<void> {
    await query(
      `UPDATE users SET force_password_reset = $2, updated_at = NOW() WHERE id = $1`,
      [userId, value],
    );
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    options: { forcePasswordReset?: boolean; clearLock?: boolean } = {},
  ): Promise<void> {
    const passwordExpiresAt = new Date();
    passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 90);

    await query(
      `UPDATE users
       SET password_hash = $2,
           force_password_reset = $3,
           password_expires_at = $4,
           failed_login_attempts = 0,
           locked_until = CASE WHEN $5 THEN NULL ELSE locked_until END,
           account_locked = CASE WHEN $5 THEN FALSE ELSE account_locked END,
           updated_at = NOW()
       WHERE id = $1`,
      [
        userId,
        passwordHash,
        options.forcePasswordReset ?? false,
        passwordExpiresAt,
        options.clearLock ?? true,
      ],
    );
  }
}

export const authRepository = new AuthRepository();
