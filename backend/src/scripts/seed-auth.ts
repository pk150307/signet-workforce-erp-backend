import { pool } from '../database/pool';
import { hashPassword } from '../utils/password';
import { logger } from '../utils/logger';
import { getPasswordExpiryDate } from '../utils/jwt';

export const DEFAULT_ADMIN = {
  username: 'sunil.kumar',
  email: 'sunil.kumar@signetcorporateservices.com',
  password: 'AdminSignet@123',
  firstName: 'Sunil',
  lastName: 'Kumar',
  fullName: 'Sunil Kumar',
} as const;

const LEGACY_ADMIN_EMAIL = 'admin@signet-erp.com';

/**
 * Upsert the default Super Admin account and credentials.
 * Safe to run on every deploy — updates password hash and profile fields.
 */
export async function seedAuthUser(): Promise<void> {
  const passwordHash = await hashPassword(DEFAULT_ADMIN.password);
  const passwordExpiresAt = getPasswordExpiryDate();

  const { rows: roleRows } = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'Super Admin' AND NOT is_deleted LIMIT 1`,
  );
  if (roleRows.length === 0) {
    throw new Error('Super Admin role not found. Run database migrations first.');
  }
  const roleId = roleRows[0].id;

  const { rows: existing } = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users
     WHERE (LOWER(email) = LOWER($1) OR LOWER(email) = LOWER($2))
       AND NOT is_deleted
     ORDER BY CASE WHEN LOWER(email) = LOWER($1) THEN 0 ELSE 1 END
     LIMIT 1`,
    [DEFAULT_ADMIN.email, LEGACY_ADMIN_EMAIL],
  );

  let userId: string;

  if (existing[0]) {
    userId = existing[0].id;
    await pool.query(
      `UPDATE users SET
        username = $2,
        email = $3,
        password_hash = $4,
        first_name = $5,
        last_name = $6,
        full_name = $7,
        is_active = TRUE,
        is_email_verified = TRUE,
        force_password_reset = FALSE,
        failed_login_attempts = 0,
        locked_until = NULL,
        account_locked = FALSE,
        password_expires_at = $8,
        updated_at = NOW(),
        updated_by = 'System'
       WHERE id = $1`,
      [
        userId,
        DEFAULT_ADMIN.username,
        DEFAULT_ADMIN.email,
        passwordHash,
        DEFAULT_ADMIN.firstName,
        DEFAULT_ADMIN.lastName,
        DEFAULT_ADMIN.fullName,
        passwordExpiresAt,
      ],
    );
    logger.info('Default admin credentials updated', { email: DEFAULT_ADMIN.email });
  } else {
    const { rows: created } = await pool.query<{ id: string }>(
      `INSERT INTO users (
        username, email, password_hash, first_name, last_name, full_name,
        is_active, is_email_verified, password_expires_at, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE,$7,'System')
      RETURNING id`,
      [
        DEFAULT_ADMIN.username,
        DEFAULT_ADMIN.email,
        passwordHash,
        DEFAULT_ADMIN.firstName,
        DEFAULT_ADMIN.lastName,
        DEFAULT_ADMIN.fullName,
        passwordExpiresAt,
      ],
    );
    userId = created[0].id;
    logger.info('Default admin user created', { email: DEFAULT_ADMIN.email });
  }

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, created_by)
     VALUES ($1, $2, 'System')
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId],
  );
}

if (require.main === module) {
  seedAuthUser()
    .then(() => {
      console.log(`Auth seed complete — ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password}`);
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
