import { PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';
import { query, withTransaction } from '../../database/pool';
import {
  BulkImportResult,
  BulkImportRow,
  CreateEmployeeInput,
  CreateEmployeeResult,
  EmployeeActivity,
  EmployeeDashboardStats,
  EmployeeDetail,
  EmployeeDocumentItem,
  EmployeeFilter,
  EmployeeListItem,
  EmployeeProfile,
  EmployeeSubmitResult,
  EmployeeTimelineItem,
  MarkLeftInput,
  RejoinEmployeeInput,
  SaveEmployeeDraftInput,
  UpdateEmployeeInput,
} from './employee.types';
import {
  BULK_EXPORT_HEADERS,
  EMPLOYEE_CODE_PAD_LENGTH,
  EMPLOYEE_CODE_PREFIX,
  EmployeeLifecycleStatus,
} from './employee.constants';
import { createPaginatedResult, PaginatedResult } from '../../types';
import {
  parseOptionalUuid,
  resolveClientId,
  resolveDepartmentId,
  resolveDesignationId,
  resolveDesignationGradeId,
} from '../../utils/organization';
import { formatDate, formatDateTime, toNumber } from '../../utils/formatters';
import { nextEmployeeCode } from '../../utils/next-code';
import { getPublicUrl, getUploadedFileUrl, isRemoteFilePath, uploadRoot, UploadedFile } from '../documents/upload.config';
import { designationGradeRepository } from '../designation-grade/designation-grade.repository';
import { computeGradeGross } from '../designation-grade/designation-grade.types';

type DbClient = Pick<PoolClient, 'query'>;

export class EmployeeRepository {
  private async run<T extends Record<string, unknown>>(
    client: DbClient | undefined,
    text: string,
    params?: unknown[],
  ) {
    if (client) {
      return client.query<T>(text, params);
    }
    return query<T>(text, params);
  }

  async syncEmployeeSnapshot(
    employeeId: string,
    updatedBy: string,
    client?: DbClient,
  ): Promise<void> {
    await this.run(
      client,
      `UPDATE employees e SET
        first_name = COALESCE(pd.first_name, e.first_name),
        last_name = COALESCE(pd.last_name, e.last_name),
        alternate_phone = pd.alternate_phone,
        date_of_birth = COALESCE(pd.date_of_birth, e.date_of_birth),
        gender = COALESCE(pd.gender, e.gender),
        profile_photo_url = pd.profile_photo_url,
        present_address = pd.present_address,
        permanent_address = pd.permanent_address,
        city = pd.city,
        state = pd.state,
        pin_code = pd.pin_code,
        employment_type = COALESCE(ed.employment_type, e.employment_type),
        department_id = COALESCE(ed.department_id, e.department_id),
        designation_id = COALESCE(ed.designation_id, e.designation_id),
        designation_grade_id = COALESCE(ed.designation_grade_id, e.designation_grade_id),
        reporting_manager_id = ed.reporting_manager_id,
        site_id = ed.site_id,
        shift_id = ed.shift_id,
        joining_date = COALESCE(ed.joining_date, e.joining_date),
        confirmation_date = ed.confirmation_date,
        resignation_date = ed.resignation_date,
        relieving_date = ed.relieving_date,
        basic_salary = COALESCE(ed.basic_salary, e.basic_salary),
        gross_salary = COALESCE(ed.gross_salary, e.gross_salary),
        ctc = COALESCE(ed.ctc, e.ctc),
        bank_name = bd.bank_name,
        account_number = bd.account_number,
        ifsc_code = bd.ifsc_code,
        account_holder_name = bd.account_holder_name,
        updated_at = NOW(),
        updated_by = $2
      FROM employee_personal_details pd
      LEFT JOIN employee_employment_details ed
        ON ed.employee_id = pd.employee_id AND ed.is_current = TRUE
      LEFT JOIN employee_bank_details bd ON bd.employee_id = pd.employee_id
      WHERE e.id = $1 AND pd.employee_id = e.id`,
      [employeeId, updatedBy],
    );
  }

  private async insertHistory(
    client: DbClient,
    employeeId: string,
    eventType: string,
    title: string,
    description: string | null,
    performedBy: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await client.query(
      `INSERT INTO employee_history (employee_id, event_type, title, description, metadata, performed_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [employeeId, eventType, title, description, JSON.stringify(metadata), performedBy],
    );
  }

  private async syncStatutoryOnMarkLeft(
    client: DbClient,
    employeeId: string,
    lastWorkingDate: string,
    changedBy: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO employee_statutory_details (
        employee_id, status, pf_exit_date, esi_exit_date,
        is_pf_applicable, is_esi_applicable, created_by
      ) VALUES ($1, 'inactive', $2, $2, FALSE, FALSE, $3)
      ON CONFLICT (employee_id) DO UPDATE SET
        status = 'inactive',
        pf_exit_date = COALESCE(employee_statutory_details.pf_exit_date, EXCLUDED.pf_exit_date),
        esi_exit_date = COALESCE(employee_statutory_details.esi_exit_date, EXCLUDED.esi_exit_date),
        is_pf_applicable = FALSE,
        is_esi_applicable = FALSE,
        updated_at = NOW(),
        updated_by = EXCLUDED.created_by`,
      [employeeId, lastWorkingDate, changedBy],
    );
  }

  private async syncStatutoryOnRejoin(
    client: DbClient,
    employeeId: string,
    joiningDate: string,
    changedBy: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO employee_statutory_details (
        employee_id, status, pf_joining_date, esi_joining_date,
        pf_exit_date, esi_exit_date, is_pf_applicable, is_esi_applicable, created_by
      ) VALUES ($1, 'active', $2, $2, NULL, NULL, TRUE, TRUE, $3)
      ON CONFLICT (employee_id) DO UPDATE SET
        status = 'active',
        pf_joining_date = COALESCE(employee_statutory_details.pf_joining_date, EXCLUDED.pf_joining_date),
        esi_joining_date = COALESCE(employee_statutory_details.esi_joining_date, EXCLUDED.esi_joining_date),
        pf_exit_date = NULL,
        esi_exit_date = NULL,
        is_pf_applicable = TRUE,
        is_esi_applicable = TRUE,
        updated_at = NOW(),
        updated_by = EXCLUDED.created_by`,
      [employeeId, joiningDate, changedBy],
    );
  }

  private async getDefaultOrgIds(
    clientId?: string,
    dbClient?: DbClient,
  ): Promise<{ departmentId: string; designationId: string }> {
    const params: unknown[] = [];
    let clientFilter = '';
    if (clientId) {
      clientFilter = ' AND d.client_id = $1::uuid';
      params.push(await resolveClientId(clientId));
    }
    const { rows } = await this.run<{ dept_id: string; des_id: string }>(
      dbClient,
      `SELECT d.id AS dept_id, des.id AS des_id
       FROM departments d
       INNER JOIN designations des ON des.department_id = d.id
       WHERE NOT d.is_deleted AND NOT des.is_deleted AND des.is_active = TRUE
       ${clientFilter}
       ORDER BY d.code, des.code
       LIMIT 1`,
      params,
    );
    if (!rows[0]) {
      throw new Error('No department or designation configured.');
    }
    return { departmentId: rows[0].dept_id, designationId: rows[0].des_id };
  }

  async getNextEmployeeCode(): Promise<string> {
    return nextEmployeeCode(
      EMPLOYEE_CODE_PREFIX.replace(/-$/, ''),
      EMPLOYEE_CODE_PAD_LENGTH,
      `^${EMPLOYEE_CODE_PREFIX.replace('-', '\\-')}[0-9]+$`,
    );
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const params: unknown[] = [email.toLowerCase()];
    let sql = 'SELECT 1 FROM employees WHERE LOWER(email) = $1 AND NOT is_deleted';
    if (excludeId) {
      sql += ' AND id != $2';
      params.push(excludeId);
    }
    const { rows } = await query(sql, params);
    return rows.length > 0;
  }

  private mapListRow(r: Record<string, unknown>): EmployeeListItem {
    return {
      id: String(r.id),
      employeeCode: String(r.employee_code),
      fullName: `${r.first_name} ${r.last_name}`.trim(),
      email: String(r.email),
      phone: String(r.phone),
      department: String(r.department_name ?? ''),
      designation: String(r.designation_name ?? ''),
      siteName: r.site_name ? String(r.site_name) : null,
      status: Number(r.status) as EmployeeLifecycleStatus,
      joiningDate: formatDate(String(r.joining_date))!,
      profilePhotoUrl: r.profile_photo_url ? String(r.profile_photo_url) : null,
    };
  }

  private mapDetailRow(r: Record<string, unknown>): EmployeeDetail {
    return {
      id: String(r.id),
      employeeCode: String(r.employee_code),
      firstName: String(r.first_name),
      lastName: String(r.last_name),
      email: String(r.email),
      phone: String(r.phone),
      alternatePhone: r.alternate_phone ? String(r.alternate_phone) : null,
      dateOfBirth: formatDate(String(r.date_of_birth))!,
      gender: Number(r.gender),
      profilePhotoUrl: r.profile_photo_url ? String(r.profile_photo_url) : null,
      joiningDate: formatDate(String(r.joining_date))!,
      confirmationDate: formatDate(r.confirmation_date as string | null),
      resignationDate: formatDate(r.resignation_date as string | null),
      status: Number(r.status) as EmployeeLifecycleStatus,
      employmentType: Number(r.employment_type),
      departmentId: String(r.department_id),
      departmentCode: r.department_code ? String(r.department_code) : null,
      departmentName: String(r.department_name),
      designationId: String(r.designation_id),
      designationCode: r.designation_code ? String(r.designation_code) : null,
      designationName: String(r.designation_name),
      designationGradeId: r.grade_uuid ? String(r.grade_uuid) : null,
      gradeCode: r.grade_code ? String(r.grade_code) : null,
      gradeName: r.grade_name ? String(r.grade_name) : null,
      reportingManagerId: r.reporting_manager_id ? String(r.reporting_manager_id) : null,
      reportingManagerName:
        r.rm_first_name && r.rm_last_name ? `${r.rm_first_name} ${r.rm_last_name}` : null,
      siteId: r.site_id ? String(r.site_id) : null,
      siteName: r.site_name ? String(r.site_name) : null,
      clientId: r.client_id ? String(r.client_id) : null,
      clientName: r.client_company_name ? String(r.client_company_name) : null,
      presentAddress: r.present_address ? String(r.present_address) : null,
      permanentAddress: r.permanent_address ? String(r.permanent_address) : null,
      city: r.city ? String(r.city) : null,
      state: r.state ? String(r.state) : null,
      pinCode: r.pin_code ? String(r.pin_code) : null,
      bankName: r.bank_name ? String(r.bank_name) : null,
      accountNumber: r.account_number ? String(r.account_number) : null,
      ifscCode: r.ifsc_code ? String(r.ifsc_code) : null,
      accountHolderName: r.account_holder_name ? String(r.account_holder_name) : null,
      pfNumber: r.pf_number ? String(r.pf_number) : null,
      esiNumber: r.esi_number ? String(r.esi_number) : null,
      panNumber: r.pan_number ? String(r.pan_number) : null,
      aadhaarNumber: r.aadhaar_number ? String(r.aadhaar_number) : null,
      uanNumber: r.uan_number ? String(r.uan_number) : null,
      basicSalary: toNumber(r.basic_salary as string),
      grossSalary: toNumber(r.gross_salary as string),
      ctc: r.ctc != null ? toNumber(r.ctc as string) : null,
      shiftId: r.shift_id ? String(r.shift_id) : null,
      draftStep: Number(r.draft_step ?? 0),
      emergencyContactName: r.emergency_contact_name ? String(r.emergency_contact_name) : null,
      emergencyContactRelationship: r.emergency_contact_relationship
        ? String(r.emergency_contact_relationship)
        : null,
      emergencyContactPhone: r.emergency_contact_phone ? String(r.emergency_contact_phone) : null,
      createdAt: formatDateTime(r.created_at as Date)!,
      updatedAt: formatDateTime(r.updated_at as Date | null),
    };
  }

  private detailJoin = `
    FROM employees e
    LEFT JOIN employee_personal_details pd ON pd.employee_id = e.id
    LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
    INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
    INNER JOIN designations des ON des.id = COALESCE(ed.designation_id, e.designation_id)
    LEFT JOIN designation_grades dg ON dg.id = COALESCE(ed.designation_grade_id, e.designation_grade_id) AND NOT dg.is_deleted
    LEFT JOIN employees rm ON rm.id = COALESCE(ed.reporting_manager_id, e.reporting_manager_id)
    LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
    LEFT JOIN clients cl ON cl.id = s.client_id AND NOT cl.is_deleted
    LEFT JOIN employee_bank_details bd ON bd.employee_id = e.id
    LEFT JOIN LATERAL (
      SELECT contact_name AS emergency_contact_name,
             relationship AS emergency_contact_relationship,
             phone AS emergency_contact_phone
      FROM employee_emergency_contacts ec
      WHERE ec.employee_id = e.id AND ec.is_primary = TRUE AND NOT ec.is_deleted
      ORDER BY ec.created_at DESC
      LIMIT 1
    ) ec ON TRUE
  `;

  private detailSelect = `
    e.id, e.employee_code, e.email, e.phone, e.status, e.draft_step,
    e.pf_number, e.esi_number, e.pan_number, e.aadhaar_number, e.uan_number,
    e.created_at, e.updated_at,
    COALESCE(pd.first_name, e.first_name) AS first_name,
    COALESCE(pd.last_name, e.last_name) AS last_name,
    COALESCE(pd.alternate_phone, e.alternate_phone) AS alternate_phone,
    COALESCE(pd.date_of_birth, e.date_of_birth) AS date_of_birth,
    COALESCE(pd.gender, e.gender) AS gender,
    COALESCE(pd.profile_photo_url, e.profile_photo_url) AS profile_photo_url,
    COALESCE(pd.present_address, e.present_address) AS present_address,
    COALESCE(pd.permanent_address, e.permanent_address) AS permanent_address,
    COALESCE(pd.city, e.city) AS city,
    COALESCE(pd.state, e.state) AS state,
    COALESCE(pd.pin_code, e.pin_code) AS pin_code,
    COALESCE(ed.employment_type, e.employment_type) AS employment_type,
    COALESCE(ed.joining_date, e.joining_date) AS joining_date,
    ed.confirmation_date, ed.resignation_date, ed.relieving_date,
    COALESCE(ed.reporting_manager_id, e.reporting_manager_id) AS reporting_manager_id,
    COALESCE(ed.site_id, e.site_id) AS site_id,
    COALESCE(ed.shift_id, e.shift_id) AS shift_id,
    COALESCE(ed.basic_salary, e.basic_salary) AS basic_salary,
    COALESCE(ed.gross_salary, e.gross_salary) AS gross_salary,
    COALESCE(ed.ctc, e.ctc) AS ctc,
    d.id AS department_id, d.code AS department_code, d.name AS department_name,
    des.id AS designation_id, des.code AS designation_code, des.name AS designation_name,
    dg.id AS grade_uuid, dg.code AS grade_code, dg.name AS grade_name,
    rm.first_name AS rm_first_name, rm.last_name AS rm_last_name,
    s.site_name,
    s.client_id,
    cl.company_name AS client_company_name,
    bd.bank_name, bd.account_number, bd.ifsc_code, bd.account_holder_name,
    ec.emergency_contact_name, ec.emergency_contact_relationship, ec.emergency_contact_phone
  `;

  async findAll(filter: EmployeeFilter): Promise<PaginatedResult<EmployeeListItem>> {
    const conditions = ['NOT e.is_deleted'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(`(
        LOWER(COALESCE(pd.first_name, e.first_name)) LIKE $${paramIndex} OR
        LOWER(COALESCE(pd.last_name, e.last_name)) LIKE $${paramIndex} OR
        LOWER(e.email) LIKE $${paramIndex} OR
        LOWER(e.employee_code) LIKE $${paramIndex} OR
        e.phone LIKE $${paramIndex}
      )`);
      params.push(`%${filter.search.toLowerCase()}%`);
      paramIndex++;
    }

    if (filter.departmentId) {
      conditions.push(`(d.id = $${paramIndex}::uuid OR d.code = $${paramIndex})`);
      params.push(filter.departmentId);
      paramIndex++;
    }

    if (filter.designationId) {
      conditions.push(`(des.id = $${paramIndex}::uuid OR des.code = $${paramIndex})`);
      params.push(filter.designationId);
      paramIndex++;
    }

    if (filter.siteId) {
      conditions.push(`COALESCE(ed.site_id, e.site_id) = $${paramIndex}::uuid`);
      params.push(filter.siteId);
      paramIndex++;
    }

    if (filter.clientId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM sites s2
        WHERE s2.id = COALESCE(ed.site_id, e.site_id)
          AND s2.client_id = $${paramIndex}::uuid
          AND NOT s2.is_deleted
      )`);
      params.push(filter.clientId);
      paramIndex++;
    }

    if (filter.status !== 'all' && filter.status !== undefined) {
      conditions.push(`e.status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    if (filter.employmentType !== undefined) {
      conditions.push(`COALESCE(ed.employment_type, e.employment_type) = $${paramIndex}`);
      params.push(filter.employmentType);
      paramIndex++;
    }

    const where = conditions.join(' AND ');
    const sortMap: Record<string, string> = {
      name: 'COALESCE(pd.first_name, e.first_name)',
      code: 'e.employee_code',
      joiningdate: 'COALESCE(ed.joining_date, e.joining_date)',
      createdat: 'e.created_at',
    };
    const sortCol = sortMap[(filter.sortBy ?? 'createdat').toLowerCase()] ?? 'e.created_at';
    const sortDir = filter.sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM employees e
       LEFT JOIN employee_personal_details pd ON pd.employee_id = e.id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
       INNER JOIN designations des ON des.id = COALESCE(ed.designation_id, e.designation_id)
       WHERE ${where}`,
      params,
    );

    const offset = (filter.page - 1) * filter.pageSize;
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.id, e.employee_code, e.email, e.phone, e.status,
              COALESCE(pd.first_name, e.first_name) AS first_name,
              COALESCE(pd.last_name, e.last_name) AS last_name,
              COALESCE(pd.profile_photo_url, e.profile_photo_url) AS profile_photo_url,
              COALESCE(ed.joining_date, e.joining_date) AS joining_date,
              d.name AS department_name, des.name AS designation_name, s.site_name
       FROM employees e
       LEFT JOIN employee_personal_details pd ON pd.employee_id = e.id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
       INNER JOIN designations des ON des.id = COALESCE(ed.designation_id, e.designation_id)
       LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
       WHERE ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, filter.pageSize, offset],
    );

    const items = rows.map((r) => this.mapListRow(r));
    return createPaginatedResult(items, parseInt(countResult.rows[0].count, 10), filter.page, filter.pageSize);
  }

  async findById(id: string): Promise<EmployeeDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${this.detailSelect} ${this.detailJoin}
       WHERE e.id = $1 AND NOT e.is_deleted`,
      [id],
    );
    const r = rows[0];
    return r ? this.mapDetailRow(r) : null;
  }

  async getDashboardStats(): Promise<EmployeeDashboardStats> {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { rows: statsRows } = await query<Record<string, unknown>>(
      `SELECT
        COUNT(*) FILTER (WHERE NOT is_deleted) AS total,
        COUNT(*) FILTER (WHERE NOT is_deleted AND status = $1) AS active,
        COUNT(*) FILTER (WHERE NOT is_deleted AND status = $2) AS left_count,
        COUNT(*) FILTER (WHERE NOT is_deleted AND status = $3) AS draft,
        COUNT(*) FILTER (WHERE NOT is_deleted AND joining_date >= $4::date) AS joiners_month,
        COUNT(*) FILTER (WHERE NOT is_deleted AND status = $2 AND relieving_date >= $4::date) AS exits_month
       FROM employees`,
      [EmployeeLifecycleStatus.Active, EmployeeLifecycleStatus.Left, EmployeeLifecycleStatus.Draft, monthStart],
    );

    const { rows: deptRows } = await query<{ department: string; count: string }>(
      `SELECT d.name AS department, COUNT(*) AS count
       FROM employees e
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
       WHERE NOT e.is_deleted AND e.status IN ($1, $2)
       GROUP BY d.name
       ORDER BY count DESC`,
      [EmployeeLifecycleStatus.Active, EmployeeLifecycleStatus.Rejoined],
    );

    const { rows: trendRows } = await query<{ month: string; joiners: string; exits: string }>(
      `SELECT TO_CHAR(month_date, 'Mon') AS month,
              COALESCE(j.joiners, 0) AS joiners,
              COALESCE(x.exits, 0) AS exits
       FROM generate_series(
         date_trunc('month', NOW()) - INTERVAL '5 months',
         date_trunc('month', NOW()),
         INTERVAL '1 month'
       ) AS month_date
       LEFT JOIN (
         SELECT date_trunc('month', joining_date) AS m, COUNT(*) AS joiners
         FROM employees WHERE NOT is_deleted
         GROUP BY 1
       ) j ON j.m = month_date
       LEFT JOIN (
         SELECT date_trunc('month', relieving_date) AS m, COUNT(*) AS exits
         FROM employees WHERE NOT is_deleted AND status = $1
         GROUP BY 1
       ) x ON x.m = month_date
       ORDER BY month_date`,
      [EmployeeLifecycleStatus.Left],
    );

    const s = statsRows[0];
    return {
      totalEmployees: Number(s.total ?? 0),
      activeEmployees: Number(s.active ?? 0),
      leftEmployees: Number(s.left_count ?? 0),
      draftEmployees: Number(s.draft ?? 0),
      newJoinersThisMonth: Number(s.joiners_month ?? 0),
      exitsThisMonth: Number(s.exits_month ?? 0),
      departmentDistribution: deptRows.map((r) => ({
        department: r.department,
        count: parseInt(r.count, 10),
      })),
      headcountTrend: trendRows.map((r) => ({
        month: r.month,
        joiners: parseInt(r.joiners, 10),
        exits: parseInt(r.exits, 10),
      })),
    };
  }

  async getRecentEmployees(limit: number): Promise<EmployeeListItem[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.id, e.employee_code, e.email, e.phone, e.status,
              COALESCE(pd.first_name, e.first_name) AS first_name,
              COALESCE(pd.last_name, e.last_name) AS last_name,
              COALESCE(pd.profile_photo_url, e.profile_photo_url) AS profile_photo_url,
              COALESCE(ed.joining_date, e.joining_date) AS joining_date,
              d.name AS department_name, des.name AS designation_name, s.site_name
       FROM employees e
       LEFT JOIN employee_personal_details pd ON pd.employee_id = e.id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
       INNER JOIN designations des ON des.id = COALESCE(ed.designation_id, e.designation_id)
       LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
       WHERE NOT e.is_deleted
       ORDER BY e.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((r) => this.mapListRow(r));
  }

  async getRecentActivities(limit: number): Promise<EmployeeActivity[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT h.id, h.employee_id, h.event_type, h.title, h.description,
              h.performed_by, h.performed_at,
              e.employee_code,
              COALESCE(pd.first_name, e.first_name) AS first_name,
              COALESCE(pd.last_name, e.last_name) AS last_name
       FROM employee_history h
       INNER JOIN employees e ON e.id = h.employee_id
       LEFT JOIN employee_personal_details pd ON pd.employee_id = e.id
       ORDER BY h.performed_at DESC
       LIMIT $1`,
      [limit],
    );

    const activityMap: Record<string, EmployeeActivity['type']> = {
      created: 'created',
      updated: 'updated',
      draft_saved: 'draft_saved',
      marked_left: 'marked_left',
      rejoined: 'rejoined',
      document_uploaded: 'document_uploaded',
    };

    return rows.map((r) => ({
      id: String(r.id),
      employeeId: String(r.employee_id),
      employeeName: `${r.first_name} ${r.last_name}`.trim(),
      employeeCode: String(r.employee_code),
      type: activityMap[String(r.event_type)] ?? 'updated',
      description: String(r.description ?? r.title),
      performedBy: String(r.performed_by),
      performedAt: formatDateTime(r.performed_at as Date)!,
    }));
  }

  private async resolveOrgIds(input: SaveEmployeeDraftInput, client?: DbClient) {
    const departmentRef = input.departmentId?.trim();
    const designationRef = input.designationId?.trim();
    const d = this.draftDefaults(input);
    const orgOptions = input.clientId ? { clientId: input.clientId } : undefined;

    let departmentId: string;
    let designationId: string;

    if (departmentRef && designationRef) {
      departmentId = await resolveDepartmentId(departmentRef, orgOptions);
      designationId = await resolveDesignationId(designationRef, {
        ...orgOptions,
        departmentId,
      });
    } else {
      const defaults = await this.getDefaultOrgIds(input.clientId, client);
      departmentId = departmentRef
        ? await resolveDepartmentId(departmentRef, orgOptions)
        : defaults.departmentId;
      designationId = designationRef
        ? await resolveDesignationId(designationRef, { ...orgOptions, departmentId })
        : defaults.designationId;
    }

    let designationGradeId: string | null = null;
    let basicSalary = input.basicSalary ?? d.basicSalary;
    let grossSalary = input.grossSalary ?? d.grossSalary;

    if (input.designationGradeId?.trim()) {
      designationGradeId = await resolveDesignationGradeId(input.designationGradeId.trim(), {
        ...orgOptions,
        designationId,
      });
      const grade = await designationGradeRepository.findById(designationGradeId);
      if (grade) {
        if (input.basicSalary == null) basicSalary = grade.basicSalary;
        if (input.grossSalary == null) grossSalary = grade.grossSalary ?? computeGradeGross(grade);
      }
    }

    return { departmentId, designationId, designationGradeId, basicSalary, grossSalary };
  }

  private draftDefaults(input: SaveEmployeeDraftInput) {
    const firstName = input.firstName?.trim() || 'Draft';
    const lastName = input.lastName?.trim() || 'Employee';
    const email = input.email?.trim().toLowerCase() || `draft-${Date.now()}@draft.signet.local`;
    const phone = input.phone?.trim() || '0000000000';
    const dateOfBirth = input.dateOfBirth || '1990-01-01';
    const gender = input.gender ?? 4;
    const joiningDate = input.joiningDate || formatDate(new Date())!;
    const employmentType = input.employmentType ?? 1;
    const basicSalary = input.basicSalary ?? 0;
    const grossSalary = input.grossSalary ?? 0;
    return { firstName, lastName, email, phone, dateOfBirth, gender, joiningDate, employmentType, basicSalary, grossSalary };
  }

  private async upsertNormalized(
    client: PoolClient,
    employeeId: string,
    input: SaveEmployeeDraftInput,
    departmentId: string,
    designationId: string,
    designationGradeId: string | null,
    basicSalary: number,
    grossSalary: number,
  ): Promise<void> {
    const d = this.draftDefaults(input);

    await client.query(
      `INSERT INTO employee_personal_details (
        employee_id, first_name, last_name, alternate_phone, date_of_birth, gender,
        present_address, permanent_address, city, state, pin_code, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (employee_id) DO UPDATE SET
        first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
        alternate_phone = EXCLUDED.alternate_phone, date_of_birth = EXCLUDED.date_of_birth,
        gender = EXCLUDED.gender, present_address = EXCLUDED.present_address,
        permanent_address = EXCLUDED.permanent_address, city = EXCLUDED.city,
        state = EXCLUDED.state, pin_code = EXCLUDED.pin_code,
        updated_at = NOW(), updated_by = EXCLUDED.created_by`,
      [
        employeeId,
        input.firstName?.trim() || d.firstName,
        input.lastName?.trim() || d.lastName,
        input.alternatePhone ?? null,
        input.dateOfBirth || d.dateOfBirth,
        input.gender ?? d.gender,
        input.presentAddress ?? null,
        input.permanentAddress ?? null,
        input.city ?? null,
        input.state ?? null,
        input.pinCode ?? null,
        input.createdBy,
      ],
    );

    const { rows: empRows } = await client.query<{ id: string }>(
      `SELECT id FROM employee_employment_details WHERE employee_id = $1 AND is_current = TRUE`,
      [employeeId],
    );

    if (empRows[0]) {
      await client.query(
        `UPDATE employee_employment_details SET
          employment_type = $2, department_id = $3, designation_id = $4, designation_grade_id = $5,
          reporting_manager_id = $6, site_id = $7, shift_id = $8,
          joining_date = $9, basic_salary = $10, gross_salary = $11, ctc = $12,
          updated_at = NOW(), updated_by = $13
         WHERE id = $1`,
        [
          empRows[0].id,
          input.employmentType ?? d.employmentType,
          departmentId,
          designationId,
          designationGradeId,
          parseOptionalUuid(input.reportingManagerId),
          parseOptionalUuid(input.siteId),
          parseOptionalUuid(input.shiftId),
          input.joiningDate || d.joiningDate,
          basicSalary,
          grossSalary,
          input.ctc ?? null,
          input.createdBy,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO employee_employment_details (
          employee_id, employment_type, department_id, designation_id, designation_grade_id,
          reporting_manager_id, site_id, shift_id, joining_date,
          basic_salary, gross_salary, ctc, is_current, period_sequence, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,1,$13)`,
        [
          employeeId,
          input.employmentType ?? d.employmentType,
          departmentId,
          designationId,
          designationGradeId,
          parseOptionalUuid(input.reportingManagerId),
          parseOptionalUuid(input.siteId),
          parseOptionalUuid(input.shiftId),
          input.joiningDate || d.joiningDate,
          basicSalary,
          grossSalary,
          input.ctc ?? null,
          input.createdBy,
        ],
      );
    }

    await client.query(
      `INSERT INTO employee_bank_details (
        employee_id, bank_name, account_number, ifsc_code, account_holder_name, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (employee_id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name, account_number = EXCLUDED.account_number,
        ifsc_code = EXCLUDED.ifsc_code, account_holder_name = EXCLUDED.account_holder_name,
        updated_at = NOW(), updated_by = EXCLUDED.created_by`,
      [
        employeeId,
        input.bankName ?? null,
        input.accountNumber ?? null,
        input.ifscCode ?? null,
        input.accountHolderName ?? null,
        input.createdBy,
      ],
    );

    if (input.emergencyContactName && input.emergencyContactPhone) {
      await client.query(
        `UPDATE employee_emergency_contacts SET is_deleted = TRUE, updated_at = NOW()
         WHERE employee_id = $1 AND is_primary = TRUE AND NOT is_deleted`,
        [employeeId],
      );
      await client.query(
        `INSERT INTO employee_emergency_contacts (
          employee_id, contact_name, relationship, phone, is_primary, created_by
        ) VALUES ($1,$2,$3,$4,TRUE,$5)`,
        [
          employeeId,
          input.emergencyContactName,
          input.emergencyContactRelationship ?? 'Other',
          input.emergencyContactPhone,
          input.createdBy,
        ],
      );
    }

    const emailValue = input.email?.trim().toLowerCase();
    const phoneValue = input.phone?.trim();

    await client.query(
      `UPDATE employees SET
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        draft_step = COALESCE($4, draft_step),
        pf_number = COALESCE($5, pf_number),
        esi_number = COALESCE($6, esi_number),
        pan_number = COALESCE($7, pan_number),
        aadhaar_number = COALESCE($8, aadhaar_number),
        uan_number = COALESCE($9, uan_number),
        updated_at = NOW(),
        updated_by = $10
       WHERE id = $1`,
      [
        employeeId,
        emailValue ?? null,
        phoneValue ?? null,
        input.draftStep ?? null,
        input.pfNumber ?? null,
        input.esiNumber ?? input.esicNumber ?? null,
        input.panNumber ?? null,
        input.aadhaarNumber ?? null,
        input.uanNumber ?? null,
        input.createdBy,
      ],
    );

    await this.syncEmployeeSnapshot(employeeId, input.createdBy, client);
  }

  async create(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
    const { departmentId, designationId, designationGradeId, basicSalary, grossSalary } =
      await this.resolveOrgIds(input);
    const employeeCode = await this.getNextEmployeeCode();

    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO employees (
          employee_code, first_name, last_name, email, phone, alternate_phone,
          date_of_birth, gender, joining_date, employment_type, status,
          department_id, designation_id, designation_grade_id, reporting_manager_id, site_id, shift_id,
          present_address, permanent_address, city, state, pin_code,
          basic_salary, gross_salary, ctc, pf_number, esi_number, pan_number,
          aadhaar_number, uan_number, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31
        ) RETURNING id`,
        [
          employeeCode,
          input.firstName,
          input.lastName,
          input.email.toLowerCase(),
          input.phone,
          input.alternatePhone ?? null,
          input.dateOfBirth,
          input.gender,
          input.joiningDate,
          input.employmentType,
          EmployeeLifecycleStatus.Active,
          departmentId,
          designationId,
          designationGradeId,
          parseOptionalUuid(input.reportingManagerId),
          parseOptionalUuid(input.siteId),
          null,
          input.presentAddress ?? null,
          input.permanentAddress ?? null,
          input.city ?? null,
          input.state ?? null,
          input.pinCode ?? null,
          basicSalary,
          grossSalary,
          null,
          input.pfNumber ?? null,
          input.esiNumber ?? input.esicNumber ?? null,
          input.panNumber ?? null,
          input.aadhaarNumber ?? null,
          input.uanNumber ?? null,
          input.createdBy,
        ],
      );
      const employeeId = rows[0].id;

      await this.upsertNormalized(
        client,
        employeeId,
        input,
        departmentId,
        designationId,
        designationGradeId,
        basicSalary,
        grossSalary,
      );
      await this.insertHistory(
        client,
        employeeId,
        'created',
        'Employee created',
        `${input.firstName} ${input.lastName} onboarded`,
        input.createdBy,
      );

      return { id: employeeId, employeeCode };
    });
  }

  async saveDraft(input: SaveEmployeeDraftInput): Promise<CreateEmployeeResult> {
    const { departmentId, designationId, designationGradeId, basicSalary, grossSalary } =
      await this.resolveOrgIds(input);
    const d = this.draftDefaults(input);

    if (input.id) {
      return withTransaction(async (client) => {
        const { rows: existing } = await client.query<{ id: string; employee_code: string }>(
          `SELECT id, employee_code FROM employees WHERE id = $1 AND NOT is_deleted`,
          [input.id],
        );
        if (!existing[0]) throw new Error('NOT_FOUND');

        await this.upsertNormalized(
          client,
          existing[0].id,
          input,
          departmentId,
          designationId,
          designationGradeId,
          basicSalary,
          grossSalary,
        );
        await client.query(
          `UPDATE employees SET status = $2, draft_step = COALESCE($3, draft_step), updated_at = NOW(), updated_by = $4
           WHERE id = $1`,
          [existing[0].id, EmployeeLifecycleStatus.Draft, input.draftStep ?? null, input.createdBy],
        );
        await this.insertHistory(
          client,
          existing[0].id,
          'draft_saved',
          'Draft saved',
          'Employee draft updated',
          input.createdBy,
        );
        return { id: existing[0].id, employeeCode: existing[0].employee_code };
      });
    }

    const employeeCode =
      input.employeeCode && /^SS-\d{5}$/i.test(input.employeeCode)
        ? input.employeeCode.toUpperCase()
        : await this.getNextEmployeeCode();

    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO employees (
          employee_code, first_name, last_name, email, phone, date_of_birth, gender,
          joining_date, employment_type, status, department_id, designation_id, designation_grade_id,
          basic_salary, gross_salary, draft_step, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING id`,
        [
          employeeCode,
          d.firstName,
          d.lastName,
          d.email,
          d.phone,
          d.dateOfBirth,
          d.gender,
          d.joiningDate,
          d.employmentType,
          EmployeeLifecycleStatus.Draft,
          departmentId,
          designationId,
          designationGradeId,
          basicSalary,
          grossSalary,
          input.draftStep ?? 1,
          input.createdBy,
        ],
      );
      const employeeId = rows[0].id;
      await this.upsertNormalized(
        client,
        employeeId,
        input,
        departmentId,
        designationId,
        designationGradeId,
        basicSalary,
        grossSalary,
      );
      await this.insertHistory(
        client,
        employeeId,
        'draft_saved',
        'Draft created',
        'Employee draft saved',
        input.createdBy,
      );
      return { id: employeeId, employeeCode };
    });
  }

  async submit(employeeId: string, submittedBy: string): Promise<EmployeeSubmitResult> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<Record<string, unknown>>(
        `SELECT e.id, e.employee_code, e.status,
                COALESCE(pd.first_name, e.first_name) AS first_name,
                COALESCE(pd.last_name, e.last_name) AS last_name,
                e.email, e.phone,
                COALESCE(pd.date_of_birth, e.date_of_birth) AS date_of_birth,
                COALESCE(ed.joining_date, e.joining_date) AS joining_date
         FROM employees e
         LEFT JOIN employee_personal_details pd ON pd.employee_id = e.id
         LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
         WHERE e.id = $1 AND NOT e.is_deleted`,
        [employeeId],
      );
      const r = rows[0];
      if (!r) throw new Error('NOT_FOUND');

      if (!r.first_name || !r.last_name || !r.email || !r.phone || !r.date_of_birth || !r.joining_date) {
        throw new Error('INCOMPLETE');
      }

      await client.query(
        `UPDATE employees SET status = $2, updated_at = NOW(), updated_by = $3 WHERE id = $1`,
        [employeeId, EmployeeLifecycleStatus.Active, submittedBy],
      );
      await this.insertHistory(
        client,
        employeeId,
        'submitted',
        'Employee submitted',
        'Draft submitted and activated',
        submittedBy,
      );

      return {
        id: employeeId,
        employeeCode: String(r.employee_code),
        status: EmployeeLifecycleStatus.Active,
        fullName: `${r.first_name} ${r.last_name}`.trim(),
      };
    });
  }

  async update(input: UpdateEmployeeInput): Promise<void> {
    const existing = await this.findById(input.id);
    if (!existing) throw new Error('NOT_FOUND');

    const { departmentId, designationId, designationGradeId, basicSalary, grossSalary } =
      await this.resolveOrgIds(input);

    await withTransaction(async (client) => {
      if (input.status !== undefined) {
        await client.query(`UPDATE employees SET status = $2 WHERE id = $1`, [input.id, input.status]);
      }

      await this.upsertNormalized(
        client,
        input.id,
        input,
        departmentId,
        designationId,
        designationGradeId,
        basicSalary,
        grossSalary,
      );
      await this.insertHistory(
        client,
        input.id,
        'updated',
        'Employee updated',
        'Employee record updated',
        input.createdBy,
      );
    });
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await query(
      `UPDATE employees SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, deletedBy],
    );
  }

  async markLeft(input: MarkLeftInput): Promise<void> {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: number }>(
        `SELECT status FROM employees WHERE id = $1 AND NOT is_deleted`,
        [input.employeeId],
      );
      if (!rows[0]) throw new Error('NOT_FOUND');

      await client.query(
        `UPDATE employees SET status = $2, left_reason = $3, left_remarks = $4,
         resignation_date = $5, relieving_date = $5, updated_at = NOW(), updated_by = $6
         WHERE id = $1`,
        [
          input.employeeId,
          EmployeeLifecycleStatus.Left,
          input.reason,
          input.remarks ?? null,
          input.lastWorkingDate,
          input.changedBy,
        ],
      );

      await client.query(
        `UPDATE employee_employment_details SET resignation_date = $2, relieving_date = $2,
         updated_at = NOW(), updated_by = $3
         WHERE employee_id = $1 AND is_current = TRUE`,
        [input.employeeId, input.lastWorkingDate, input.changedBy],
      );

      await client.query(
        `INSERT INTO employee_status_history (
          employee_id, from_status, to_status, reason, remarks, last_working_date, effective_date, changed_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7)`,
        [
          input.employeeId,
          rows[0].status,
          EmployeeLifecycleStatus.Left,
          input.reason,
          input.remarks ?? null,
          input.lastWorkingDate,
          input.changedBy,
        ],
      );

      await this.insertHistory(
        client,
        input.employeeId,
        'marked_left',
        'Employee marked as left',
        input.reason,
        input.changedBy,
        { lastWorkingDate: input.lastWorkingDate },
      );

      await this.syncStatutoryOnMarkLeft(
        client,
        input.employeeId,
        input.lastWorkingDate,
        input.changedBy,
      );
    });
  }

  async rejoin(input: RejoinEmployeeInput): Promise<void> {
    const departmentId = await resolveDepartmentId(input.departmentId);
    const designationId = await resolveDesignationId(input.designationId);

    await withTransaction(async (client) => {
      const { rows } = await client.query<{ status: number; employee_code: string }>(
        `SELECT status, employee_code FROM employees WHERE id = $1 AND NOT is_deleted`,
        [input.employeeId],
      );
      if (!rows[0]) throw new Error('NOT_FOUND');

      let employeeCode = rows[0].employee_code;
      if (!input.reuseEmployeeCode) {
        employeeCode = await this.getNextEmployeeCode();
        await client.query(`UPDATE employees SET employee_code = $2 WHERE id = $1`, [
          input.employeeId,
          employeeCode,
        ]);
      }

      await client.query(
        `UPDATE employee_employment_details SET is_current = FALSE, updated_at = NOW(), updated_by = $2
         WHERE employee_id = $1 AND is_current = TRUE`,
        [input.employeeId, input.changedBy],
      );

      const { rows: seqRows } = await client.query<{ max_seq: string }>(
        `SELECT COALESCE(MAX(period_sequence), 0) AS max_seq FROM employee_employment_details WHERE employee_id = $1`,
        [input.employeeId],
      );
      const nextSeq = parseInt(seqRows[0]?.max_seq ?? '0', 10) + 1;

      await client.query(
        `INSERT INTO employee_employment_details (
          employee_id, employment_type, department_id, designation_id,
          reporting_manager_id, site_id, joining_date, basic_salary, gross_salary,
          is_current, period_sequence, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10,$11)`,
        [
          input.employeeId,
          1,
          departmentId,
          designationId,
          parseOptionalUuid(input.reportingManagerId),
          parseOptionalUuid(input.siteId),
          input.joiningDate,
          input.basicSalary ?? 0,
          input.grossSalary ?? 0,
          nextSeq,
          input.changedBy,
        ],
      );

      await client.query(
        `UPDATE employees SET status = $2, joining_date = $3, left_reason = NULL, left_remarks = NULL,
         resignation_date = NULL, relieving_date = NULL, department_id = $4, designation_id = $5,
         reporting_manager_id = $6, site_id = $7, basic_salary = COALESCE($8, basic_salary),
         gross_salary = COALESCE($9, gross_salary), updated_at = NOW(), updated_by = $10
         WHERE id = $1`,
        [
          input.employeeId,
          EmployeeLifecycleStatus.Rejoined,
          input.joiningDate,
          departmentId,
          designationId,
          parseOptionalUuid(input.reportingManagerId),
          parseOptionalUuid(input.siteId),
          input.basicSalary ?? null,
          input.grossSalary ?? null,
          input.changedBy,
        ],
      );

      await this.syncEmployeeSnapshot(input.employeeId, input.changedBy, client);

      await client.query(
        `INSERT INTO employee_status_history (
          employee_id, from_status, to_status, effective_date, changed_by
        ) VALUES ($1,$2,$3,$4,$5)`,
        [
          input.employeeId,
          rows[0].status,
          EmployeeLifecycleStatus.Rejoined,
          input.joiningDate,
          input.changedBy,
        ],
      );

      await this.insertHistory(
        client,
        input.employeeId,
        'rejoined',
        'Employee rejoined',
        `Rejoined on ${input.joiningDate}`,
        input.changedBy,
        { employeeCode, reuseEmployeeCode: input.reuseEmployeeCode },
      );

      await this.syncStatutoryOnRejoin(
        client,
        input.employeeId,
        input.joiningDate,
        input.changedBy,
      );
    });
  }

  async updatePhoto(employeeId: string, photoUrl: string, updatedBy: string): Promise<{ url: string; profilePhotoUrl: string }> {
    const url = getPublicUrl(photoUrl);
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE employees SET profile_photo_url = $2, updated_at = NOW(), updated_by = $3 WHERE id = $1`,
        [employeeId, url, updatedBy],
      );
      await client.query(
        `UPDATE employee_personal_details SET profile_photo_url = $2, updated_at = NOW(), updated_by = $3
         WHERE employee_id = $1`,
        [employeeId, url, updatedBy],
      );
    });
    return { url, profilePhotoUrl: url };
  }

  async getProfile(employeeId: string): Promise<EmployeeProfile | null> {
    const detail = await this.findById(employeeId);
    if (!detail) return null;

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))!;

    const { rows: attRows } = await query<Record<string, unknown>>(
      `SELECT
        COUNT(*) FILTER (WHERE status = 1) AS present_days,
        COUNT(*) FILTER (WHERE status = 2) AS absent_days,
        COUNT(*) FILTER (WHERE status = 4) AS leave_days,
        COUNT(*) AS working_days
       FROM attendances
       WHERE employee_id = $1 AND attendance_date BETWEEN $2::date AND $3::date`,
      [employeeId, monthStart, monthEnd],
    );

    const { rows: leaveRows } = await query<Record<string, unknown>>(
      `SELECT
        COALESCE(SUM(number_of_days) FILTER (WHERE status = 2), 0) AS approved_days,
        COUNT(*) FILTER (WHERE status = 1) AS pending_requests
       FROM leave_requests
       WHERE employee_id = $1 AND NOT is_deleted`,
      [employeeId],
    );

    const { rows: slipRows } = await query<Record<string, unknown>>(
      `SELECT month, year, net_salary FROM salary_slips
       WHERE employee_id = $1 ORDER BY year DESC, month DESC LIMIT 1`,
      [employeeId],
    );

    const { rows: ytdRows } = await query<{ ytd: string }>(
      `SELECT COALESCE(SUM(gross_earnings), 0) AS ytd FROM salary_slips
       WHERE employee_id = $1 AND year = $2`,
      [employeeId, now.getFullYear()],
    );

    const documents = await this.getDocuments(employeeId);
    const timeline = await this.getTimeline(employeeId);

    const att = attRows[0] ?? {};
    const leave = leaveRows[0] ?? {};
    const slip = slipRows[0];

    return {
      ...detail,
      attendanceSummary: {
        presentDays: Number(att.present_days ?? 0),
        absentDays: Number(att.absent_days ?? 0),
        leaveDays: Number(att.leave_days ?? 0),
        workingDays: Number(att.working_days ?? 0),
      },
      payrollSummary: {
        lastProcessedMonth: slip ? Number(slip.month) : null,
        lastProcessedYear: slip ? Number(slip.year) : null,
        lastNetSalary: slip ? toNumber(slip.net_salary as string) : null,
        ytdGross: toNumber(ytdRows[0]?.ytd),
      },
      leaveSummary: {
        approvedDays: Number(leave.approved_days ?? 0),
        pendingRequests: Number(leave.pending_requests ?? 0),
      },
      documents,
      history: timeline,
      timeline,
    };
  }

  async getTimeline(employeeId: string): Promise<EmployeeTimelineItem[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, event_type, title, description, metadata, performed_by, performed_at
       FROM employee_history
       WHERE employee_id = $1
       ORDER BY performed_at DESC`,
      [employeeId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      eventType: String(r.event_type) as EmployeeTimelineItem['eventType'],
      title: String(r.title),
      description: r.description ? String(r.description) : null,
      performedBy: String(r.performed_by),
      performedAt: formatDateTime(r.performed_at as Date)!,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    }));
  }

  async getHistory(employeeId: string): Promise<EmployeeTimelineItem[]> {
    return this.getTimeline(employeeId);
  }

  async getDocuments(employeeId: string): Promise<EmployeeDocumentItem[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, document_type, label, file_name, file_path, mime_type, version, uploaded_at
       FROM employee_documents
       WHERE employee_id = $1 AND NOT is_deleted AND is_current = TRUE
       ORDER BY uploaded_at DESC`,
      [employeeId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      type: String(r.document_type) as EmployeeDocumentItem['type'],
      label: String(r.label),
      fileName: String(r.file_name),
      fileUrl: getPublicUrl(String(r.file_path)),
      mimeType: String(r.mime_type),
      version: Number(r.version),
      uploadedAt: formatDateTime(r.uploaded_at as Date)!,
    }));
  }

  async uploadDocument(
    employeeId: string,
    type: string,
    label: string,
    file: Express.Multer.File,
    uploadedBy: string,
  ): Promise<EmployeeDocumentItem> {
    const url = getUploadedFileUrl(file as UploadedFile);

    return withTransaction(async (client) => {
      const { rows: existing } = await client.query<{ id: string; version: number }>(
        `SELECT id, version FROM employee_documents
         WHERE employee_id = $1 AND document_type = $2 AND is_current = TRUE AND NOT is_deleted`,
        [employeeId, type],
      );

      let version = 1;
      let replacedId: string | null = null;
      if (existing[0]) {
        version = existing[0].version + 1;
        replacedId = existing[0].id;
        await client.query(
          `UPDATE employee_documents SET is_current = FALSE WHERE id = $1`,
          [existing[0].id],
        );
      }

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO employee_documents (
          employee_id, document_type, label, file_name, file_path, mime_type, file_size,
          version, is_current, replaced_document_id, uploaded_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10)
        RETURNING id`,
        [
          employeeId,
          type,
          label,
          file.originalname,
          url,
          file.mimetype,
          file.size,
          version,
          replacedId,
          uploadedBy,
        ],
      );

      if (type === 'profile_photo') {
        await client.query(`UPDATE employees SET profile_photo_url = $2 WHERE id = $1`, [employeeId, url]);
        await client.query(
          `UPDATE employee_personal_details SET profile_photo_url = $2 WHERE employee_id = $1`,
          [employeeId, url],
        );
      }

      await this.insertHistory(
        client,
        employeeId,
        replacedId ? 'document_replaced' : 'document_uploaded',
        replacedId ? 'Document replaced' : 'Document uploaded',
        label,
        uploadedBy,
        { documentType: type, fileName: file.originalname },
      );

      return {
        id: rows[0].id,
        type: type as EmployeeDocumentItem['type'],
        label,
        fileName: file.originalname,
        fileUrl: url,
        mimeType: file.mimetype,
        version,
        uploadedAt: formatDateTime(new Date())!,
      };
    });
  }

  async deleteDocument(employeeId: string, documentId: string, deletedBy: string): Promise<void> {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ label: string; document_type: string }>(
        `UPDATE employee_documents SET is_deleted = TRUE, is_current = FALSE,
         deleted_at = NOW(), deleted_by = $3
         WHERE id = $1 AND employee_id = $2 AND NOT is_deleted
         RETURNING label, document_type`,
        [documentId, employeeId, deletedBy],
      );
      if (!rows[0]) throw new Error('NOT_FOUND');

      await this.insertHistory(
        client,
        employeeId,
        'document_deleted',
        'Document deleted',
        rows[0].label,
        deletedBy,
        { documentType: rows[0].document_type },
      );
    });
  }

  async getDocumentFilePath(
    employeeId: string,
    documentId: string,
  ): Promise<{ filePath: string; fileName: string; mimeType: string; isRemote: boolean } | null> {
    const { rows } = await query<{ file_path: string; file_name: string; mime_type: string }>(
      `SELECT file_path, file_name, mime_type FROM employee_documents
       WHERE id = $1 AND employee_id = $2 AND NOT is_deleted`,
      [documentId, employeeId],
    );
    if (!rows[0]) return null;
    const stored = rows[0].file_path;
    const isRemote = isRemoteFilePath(stored);
    return {
      filePath: isRemote ? stored : path.join(uploadRoot, stored),
      fileName: rows[0].file_name,
      mimeType: rows[0].mime_type,
      isRemote,
    };
  }

  async bulkImport(rows: BulkImportRow[], createdBy: string): Promise<BulkImportResult> {
    const result: BulkImportResult = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (await this.emailExists(row.email)) {
          result.skipped++;
          result.errors.push({ row: i + 1, message: `Email '${row.email}' already exists.` });
          continue;
        }
        await this.create({
          ...row,
          gender: row.gender,
          employmentType: row.employmentType,
          createdBy,
        });
        result.imported++;
      } catch (error) {
        result.skipped++;
        result.errors.push({
          row: i + 1,
          message: error instanceof Error ? error.message : 'Import failed',
        });
      }
    }

    return result;
  }

  async exportEmployees(): Promise<string> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.employee_code,
              COALESCE(pd.first_name, e.first_name) AS first_name,
              COALESCE(pd.last_name, e.last_name) AS last_name,
              e.email, e.phone, e.status,
              d.name AS department, des.name AS designation, s.site_name AS site,
              COALESCE(ed.joining_date, e.joining_date) AS joining_date,
              COALESCE(ed.basic_salary, e.basic_salary) AS basic_salary,
              COALESCE(ed.gross_salary, e.gross_salary) AS gross_salary
       FROM employees e
       LEFT JOIN employee_personal_details pd ON pd.employee_id = e.id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
       INNER JOIN designations des ON des.id = COALESCE(ed.designation_id, e.designation_id)
       LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
       WHERE NOT e.is_deleted
       ORDER BY e.employee_code`,
    );

    const escape = (value: unknown) => {
      const str = value == null ? '' : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines = [BULK_EXPORT_HEADERS.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.employee_code,
          r.first_name,
          r.last_name,
          r.email,
          r.phone,
          r.status,
          r.department,
          r.designation,
          r.site ?? '',
          formatDate(String(r.joining_date)),
          r.basic_salary,
          r.gross_salary,
        ]
          .map(escape)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  documentExistsOnDisk(filePath: string): boolean {
    return fs.existsSync(filePath);
  }
}

export const employeeRepository = new EmployeeRepository();
