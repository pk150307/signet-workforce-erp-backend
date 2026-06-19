import { pool } from './pool';
import { hashPassword } from '../utils/password';
import { logger } from '../utils/logger';

const MODULES = [
  'Employees', 'Clients', 'Sites', 'Attendance', 'Leave',
  'Payroll', 'Billing', 'Reports', 'Settings', 'Dashboard',
];

const ACTIONS = ['Create', 'Read', 'Update', 'Delete', 'Export', 'Approve'];

const DEPARTMENTS = [
  { code: 'dept-001', name: 'Operations' },
  { code: 'dept-002', name: 'Security' },
  { code: 'dept-003', name: 'Housekeeping' },
  { code: 'dept-004', name: 'Administration' },
];

const DESIGNATIONS = [
  { code: 'des-001', name: 'Security Guard', departmentCode: 'dept-002', level: 1 },
  { code: 'des-002', name: 'Supervisor', departmentCode: 'dept-001', level: 2 },
  { code: 'des-003', name: 'Housekeeping Staff', departmentCode: 'dept-003', level: 1 },
  { code: 'des-004', name: 'Manager', departmentCode: 'dept-004', level: 3 },
];

export async function seedDatabase(): Promise<void> {
  logger.info('Seeding database...');

  for (const dept of DEPARTMENTS) {
    await pool.query(
      `INSERT INTO departments (code, name, is_active, created_by)
       VALUES ($1, $2, TRUE, 'System')
       ON CONFLICT (code) DO NOTHING`,
      [dept.code, dept.name],
    );
  }

  for (const des of DESIGNATIONS) {
    await pool.query(
      `INSERT INTO designations (code, name, department_id, level, is_active, created_by)
       SELECT $1, $2, d.id, $3, TRUE, 'System'
       FROM departments d WHERE d.code = $4
       ON CONFLICT (code) DO NOTHING`,
      [des.code, des.name, des.level, des.departmentCode],
    );
  }

  const { rows: existingUsers } = await pool.query('SELECT id FROM users LIMIT 1');
  if (existingUsers.length > 0) {
    await seedHolidays();
    logger.info('Seed skipped — users already exist');
    return;
  }

  const permissionIds: string[] = [];
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO permissions (module, resource, action, description, created_by)
         VALUES ($1, $2, $3, $4, 'System')
         ON CONFLICT (module, resource, action) DO UPDATE SET module = EXCLUDED.module
         RETURNING id`,
        [module, module, action, `${action} ${module}`],
      );
      permissionIds.push(rows[0].id);
    }
  }

  const { rows: roleRows } = await pool.query<{ id: string }>(
    `INSERT INTO roles (name, description, is_system, is_active, created_by)
     VALUES ('Super Admin', 'Full system access', TRUE, TRUE, 'System')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );
  const roleId = roleRows[0].id;

  for (const permissionId of permissionIds) {
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id, created_by)
       VALUES ($1, $2, 'System')
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleId, permissionId],
    );
  }

  const passwordHash = await hashPassword('Admin@123');
  const { rows: userRows } = await pool.query<{ id: string }>(
    `INSERT INTO users (username, email, password_hash, full_name, is_active, is_email_verified, created_by)
     VALUES ('admin', 'admin@signet-erp.com', $1, 'System Administrator', TRUE, TRUE, 'System')
     RETURNING id`,
    [passwordHash],
  );

  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, created_by) VALUES ($1, $2, 'System')
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userRows[0].id, roleId],
  );

  await pool.query(
    `INSERT INTO notifications (user_id, title, message, link, created_by)
     VALUES ($1, 'Welcome to Signet ERP', 'Your administrator account is ready.', '/dashboard', 'System')`,
    [userRows[0].id],
  );

  await seedHolidays();
  logger.info('Database seed completed');
}

export async function seedHolidays(): Promise<void> {
  const year = new Date().getFullYear();
  const holidays = [
    { name: 'Republic Day', date: `${year}-01-26`, type: 'national' },
    { name: 'Independence Day', date: `${year}-08-15`, type: 'national' },
    { name: 'Gandhi Jayanti', date: `${year}-10-02`, type: 'national' },
  ];

  for (const h of holidays) {
    await pool.query(
      `INSERT INTO holidays (name, holiday_date, holiday_type, created_by)
       VALUES ($1, $2, $3, 'System')
       ON CONFLICT (holiday_date, name) DO NOTHING`,
      [h.name, h.date, h.type],
    );
  }
}
