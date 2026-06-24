import { pool } from '../../database/pool';
import { hashPassword } from '../../utils/password';
import { getPasswordExpiryDate } from '../../utils/jwt';

export const TEST_HR_MANAGER = {
  username: 'hr.manager.test',
  email: 'hr.manager.test@signetcorporateservices.com',
  password: 'HrManager@Test123',
  firstName: 'HR',
  lastName: 'Manager',
  fullName: 'HR Manager Test',
} as const;

export function uniqueTestEmail(prefix = 'iam.test'): string {
  return `${prefix}.${Date.now()}@signetcorporateservices.com`;
}

/** Ensures a dedicated HR Manager account exists for integration tests. */
export async function seedTestHrManager(): Promise<void> {
  const passwordHash = await hashPassword(TEST_HR_MANAGER.password);
  const passwordExpiresAt = getPasswordExpiryDate();

  const { rows: roleRows } = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'HR Manager' AND NOT is_deleted LIMIT 1`,
  );
  if (roleRows.length === 0) {
    throw new Error('HR Manager role not found. Run migrations first.');
  }
  const roleId = roleRows[0].id;

  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND NOT is_deleted LIMIT 1`,
    [TEST_HR_MANAGER.email],
  );

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    await pool.query(
      `UPDATE users SET
        username = $2, password_hash = $3, first_name = $4, last_name = $5, full_name = $6,
        is_active = TRUE, is_email_verified = TRUE, force_password_reset = FALSE,
        failed_login_attempts = 0, locked_until = NULL, account_locked = FALSE,
        password_expires_at = $7, updated_at = NOW(), updated_by = 'System'
       WHERE id = $1`,
      [
        userId,
        TEST_HR_MANAGER.username,
        passwordHash,
        TEST_HR_MANAGER.firstName,
        TEST_HR_MANAGER.lastName,
        TEST_HR_MANAGER.fullName,
        passwordExpiresAt,
      ],
    );
  } else {
    const { rows: created } = await pool.query<{ id: string }>(
      `INSERT INTO users (
        username, email, password_hash, first_name, last_name, full_name,
        is_active, is_email_verified, password_expires_at, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE,$7,'System')
      RETURNING id`,
      [
        TEST_HR_MANAGER.username,
        TEST_HR_MANAGER.email,
        passwordHash,
        TEST_HR_MANAGER.firstName,
        TEST_HR_MANAGER.lastName,
        TEST_HR_MANAGER.fullName,
        passwordExpiresAt,
      ],
    );
    userId = created[0].id;
  }

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, created_by)
     VALUES ($1, $2, 'System')
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId],
  );
}

export async function getRoleIdByName(roleName: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = $1 AND NOT is_deleted LIMIT 1`,
    [roleName],
  );
  if (!rows[0]) throw new Error(`Role not found: ${roleName}`);
  return rows[0].id;
}
