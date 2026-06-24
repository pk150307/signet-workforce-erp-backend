import { pool } from './pool';
import { logger } from '../utils/logger';
import { seedDefaultUsers } from '../scripts/seed-auth';

const MODULES = [
  'Employees', 'Clients', 'Sites', 'Attendance', 'Leave',
  'Payroll', 'Billing', 'Reports', 'Settings', 'Dashboard',
];

const ACTIONS = ['Create', 'Read', 'Update', 'Delete', 'Export', 'Approve'];

/** Demo-only org templates — never applied to existing production clients. */
const DEMO_DEPARTMENTS = [
  { code: 'dept-001', name: 'Operations' },
  { code: 'dept-002', name: 'Security' },
  { code: 'dept-003', name: 'Housekeeping' },
  { code: 'dept-004', name: 'Administration' },
];

const DEMO_DESIGNATIONS = [
  { code: 'des-001', name: 'Security Guard', departmentCode: 'dept-002', level: 1 },
  { code: 'des-002', name: 'Supervisor', departmentCode: 'dept-001', level: 2 },
  { code: 'des-003', name: 'Housekeeping Staff', departmentCode: 'dept-003', level: 1 },
  { code: 'des-004', name: 'Manager', departmentCode: 'dept-004', level: 3 },
];

/** Demo clients use dedicated codes — never CLT-0001 (reserved for production). */
const DEMO_CLIENTS = [
  {
    code: 'CLT-DEMO-001',
    companyName: 'Brigade Enterprises Ltd',
    contactPerson: 'Rajesh Kumar',
    email: 'contact@brigade.com',
    phone: '+91 80 4000 1000',
    city: 'Bengaluru',
    state: 'Karnataka',
    address: 'Brigade Gateway, Malleshwaram',
    pinCode: '560003',
  },
  {
    code: 'CLT-DEMO-002',
    companyName: 'Manyata Developers',
    contactPerson: 'Priya Sharma',
    email: 'hr@manyata.com',
    phone: '+91 80 4000 2000',
    city: 'Bengaluru',
    state: 'Karnataka',
    address: 'Manyata Embassy Business Park',
    pinCode: '560045',
  },
  {
    code: 'CLT-DEMO-003',
    companyName: 'Infosys Ltd',
    contactPerson: 'Anil Verma',
    email: 'facilities@infosys.com',
    phone: '+91 80 2852 0261',
    city: 'Bengaluru',
    state: 'Karnataka',
    address: 'Electronics City, Hosur Road',
    pinCode: '560100',
  },
];

const DEMO_SITES_BY_CLIENT: Record<string, { code: string; name: string; city: string; headcount: number }[]> = {
  'CLT-DEMO-001': [
    { code: 'SITE-BTP', name: 'Brigade Tech Park', city: 'Bengaluru', headcount: 45 },
    { code: 'SITE-WFM', name: 'Whitefield Mall', city: 'Bengaluru', headcount: 20 },
  ],
  'CLT-DEMO-002': [
    { code: 'SITE-MTP', name: 'Manyata Tech Park', city: 'Bengaluru', headcount: 60 },
  ],
  'CLT-DEMO-003': [
    { code: 'SITE-EC', name: 'Electronic City Phase 1', city: 'Bengaluru', headcount: 30 },
    { code: 'SITE-HYD', name: 'HITEC City', city: 'Hyderabad', headcount: 35 },
  ],
};

export async function seedDatabase(): Promise<void> {
  logger.info('Seeding database...');

  await seedHolidays();
  await seedDemoClients();

  const { rows: existingUsers } = await pool.query('SELECT id FROM users LIMIT 1');
  if (existingUsers.length > 0) {
    await seedDefaultUsers();
    logger.info('Seed skipped — users already exist (default credentials refreshed)');
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

  const adminUserId = await seedDefaultUsers();

  if (adminUserId) {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, link, created_by)
       VALUES ($1, 'Welcome to Signet ERP', 'Your administrator account is ready.', '/dashboard', 'System')`,
      [adminUserId],
    );
  }

  logger.info('Database seed completed');
}

async function seedDemoOrgStructure(clientId: string): Promise<void> {
  for (const dept of DEMO_DEPARTMENTS) {
    await pool.query(
      `INSERT INTO departments (client_id, code, name, is_active, created_by)
       VALUES ($1, $2, $3, TRUE, 'System')
       ON CONFLICT (client_id, code) WHERE NOT is_deleted DO NOTHING`,
      [clientId, dept.code, dept.name],
    );
  }

  for (const des of DEMO_DESIGNATIONS) {
    await pool.query(
      `INSERT INTO designations (code, name, department_id, level, is_active, created_by)
       SELECT $1, $2, d.id, $3, TRUE, 'System'
       FROM departments d
       WHERE d.client_id = $4::uuid AND d.code = $5 AND NOT d.is_deleted
       ON CONFLICT (department_id, code) WHERE NOT is_deleted DO NOTHING`,
      [des.code, des.name, des.level, clientId, des.departmentCode],
    );
  }
}

async function seedDemoClients(): Promise<void> {
  for (const client of DEMO_CLIENTS) {
    const { rows: inserted } = await pool.query<{ id: string }>(
      `INSERT INTO clients (
        client_code, company_name, contact_person, email, phone,
        address, city, state, pin_code, is_active, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,'System')
      ON CONFLICT (client_code) DO NOTHING
      RETURNING id`,
      [
        client.code,
        client.companyName,
        client.contactPerson,
        client.email,
        client.phone,
        client.address,
        client.city,
        client.state,
        client.pinCode,
      ],
    );

    let clientId = inserted[0]?.id;
    if (!clientId) {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM clients WHERE client_code = $1 AND NOT is_deleted`,
        [client.code],
      );
      clientId = existing.rows[0]?.id;
      if (!clientId) continue;
    } else {
      await seedDemoOrgStructure(clientId);
    }

    for (const site of DEMO_SITES_BY_CLIENT[client.code] ?? []) {
      await pool.query(
        `INSERT INTO sites (
          site_code, site_name, client_id, address, city, state, required_headcount, is_active, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,'System')
        ON CONFLICT (site_code) DO NOTHING`,
        [site.code, site.name, clientId, site.name, site.city, client.state, site.headcount],
      );
    }
  }

  logger.info('Demo clients seeded (existing production clients untouched)');
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
