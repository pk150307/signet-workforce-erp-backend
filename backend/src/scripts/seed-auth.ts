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

export const DEFAULT_HR_MANAGER = {
  username: 'contact',
  email: 'contact@signetcorporateservices.com',
  password: 'hrSignet@123',
  firstName: 'HR',
  lastName: 'Manager',
  fullName: 'HR Manager',
} as const;

const LEGACY_ADMIN_EMAIL = 'admin@signet-erp.com';

type SeedUser = {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  fullName: string;
};

async function upsertSeedUser(
  user: SeedUser,
  roleName: string,
  options?: { legacyEmail?: string },
): Promise<string> {
  const passwordHash = await hashPassword(user.password);
  const passwordExpiresAt = getPasswordExpiryDate();

  const { rows: roleRows } = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = $1 AND NOT is_deleted LIMIT 1`,
    [roleName],
  );
  if (roleRows.length === 0) {
    throw new Error(`${roleName} role not found. Run database migrations first.`);
  }
  const roleId = roleRows[0].id;

  const lookupEmails = options?.legacyEmail
    ? [user.email, options.legacyEmail]
    : [user.email];

  const { rows: existing } = await pool.query<{ id: string; email: string }>(
    `SELECT id, email FROM users
     WHERE LOWER(email) = ANY($1::text[])
       AND NOT is_deleted
     ORDER BY CASE WHEN LOWER(email) = LOWER($2) THEN 0 ELSE 1 END
     LIMIT 1`,
    [lookupEmails.map((e) => e.toLowerCase()), user.email],
  );

  let userId: string;
  let created = false;

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
        user.username,
        user.email,
        passwordHash,
        user.firstName,
        user.lastName,
        user.fullName,
        passwordExpiresAt,
      ],
    );
    logger.info('Default user credentials updated', { email: user.email, role: roleName });
  } else {
    const { rows: createdRows } = await pool.query<{ id: string }>(
      `INSERT INTO users (
        username, email, password_hash, first_name, last_name, full_name,
        is_active, is_email_verified, password_expires_at, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE,$7,'System')
      RETURNING id`,
      [
        user.username,
        user.email,
        passwordHash,
        user.firstName,
        user.lastName,
        user.fullName,
        passwordExpiresAt,
      ],
    );
    userId = createdRows[0].id;
    created = true;
    logger.info('Default user created', { email: user.email, role: roleName });
  }

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, created_by)
     VALUES ($1, $2, 'System')
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId, roleId],
  );

  return created ? userId : '';
}

/**
 * Upsert the default Super Admin account and credentials.
 * Safe to run on every deploy — updates password hash and profile fields.
 */
export async function seedAuthUser(): Promise<string> {
  return upsertSeedUser(DEFAULT_ADMIN, 'Super Admin', { legacyEmail: LEGACY_ADMIN_EMAIL });
}

/**
 * Upsert the default HR Manager account and credentials.
 * Safe to run on every deploy — updates password hash and profile fields.
 */
export async function seedHrManagerUser(): Promise<void> {
  await upsertSeedUser(DEFAULT_HR_MANAGER, 'HR Manager');
}

/** Upsert all default system accounts (Super Admin + HR Manager). */
export async function seedDefaultUsers(): Promise<string> {
  const adminUserId = await seedAuthUser();
  await seedHrManagerUser();
  return adminUserId;
}

if (require.main === module) {
  seedDefaultUsers()
    .then(() => {
      console.log(`Auth seed complete — ${DEFAULT_ADMIN.email} / ${DEFAULT_ADMIN.password}`);
      console.log(`HR Manager seed complete — ${DEFAULT_HR_MANAGER.email} / ${DEFAULT_HR_MANAGER.password}`);
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
