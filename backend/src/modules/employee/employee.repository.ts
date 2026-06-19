import { query } from '../../database/pool';
import {
  CreateEmployeeInput,
  EmployeeDetail,
  EmployeeFilter,
  EmployeeListItem,
  UpdateEmployeeInput,
} from './employee.types';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { resolveDepartmentId, resolveDesignationId, parseOptionalUuid } from '../../utils/organization';
import { formatDate, formatDateTime, toNumber } from '../../utils/formatters';
import { EmployeeStatus } from '../../types/enums';

export class EmployeeRepository {
  private listSelect = `
    e.id, e.employee_code, e.first_name, e.last_name, e.email, e.phone,
    e.status, e.joining_date, e.profile_photo_url,
    d.name AS department_name, des.name AS designation_name, s.site_name
  `;

  private detailSelect = `
    e.*, d.code AS department_code, d.name AS department_name,
    des.code AS designation_code, des.name AS designation_name,
    rm.first_name AS rm_first_name, rm.last_name AS rm_last_name, s.site_name
  `;

  async findAll(filter: EmployeeFilter): Promise<PaginatedResult<EmployeeListItem>> {
    const conditions = ['NOT e.is_deleted'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.search) {
      conditions.push(`(
        LOWER(e.first_name) LIKE $${paramIndex} OR LOWER(e.last_name) LIKE $${paramIndex} OR
        LOWER(e.email) LIKE $${paramIndex} OR LOWER(e.employee_code) LIKE $${paramIndex} OR
        e.phone LIKE $${paramIndex}
      )`);
      params.push(`%${filter.search.toLowerCase()}%`);
      paramIndex++;
    }

    if (filter.departmentId) {
      conditions.push(`(e.department_id = $${paramIndex}::uuid OR d.code = $${paramIndex})`);
      params.push(filter.departmentId);
      paramIndex++;
    }

    if (filter.designationId) {
      conditions.push(`(e.designation_id = $${paramIndex}::uuid OR des.code = $${paramIndex})`);
      params.push(filter.designationId);
      paramIndex++;
    }

    if (filter.siteId) {
      conditions.push(`e.site_id = $${paramIndex}::uuid`);
      params.push(filter.siteId);
      paramIndex++;
    }

    if (filter.status !== undefined) {
      conditions.push(`e.status = $${paramIndex}`);
      params.push(filter.status);
      paramIndex++;
    }

    if (filter.employmentType !== undefined) {
      conditions.push(`e.employment_type = $${paramIndex}`);
      params.push(filter.employmentType);
      paramIndex++;
    }

    const where = conditions.join(' AND ');
    const sortMap: Record<string, string> = {
      name: 'e.first_name',
      code: 'e.employee_code',
      joiningdate: 'e.joining_date',
      createdat: 'e.created_at',
    };
    const sortCol = sortMap[(filter.sortBy ?? 'createdat').toLowerCase()] ?? 'e.created_at';
    const sortDir = filter.sortDir?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM employees e
       INNER JOIN departments d ON d.id = e.department_id
       INNER JOIN designations des ON des.id = e.designation_id
       LEFT JOIN sites s ON s.id = e.site_id
       WHERE ${where}`,
      params,
    );

    const offset = (filter.page - 1) * filter.pageSize;
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${this.listSelect} FROM employees e
       INNER JOIN departments d ON d.id = e.department_id
       INNER JOIN designations des ON des.id = e.designation_id
       LEFT JOIN sites s ON s.id = e.site_id
       WHERE ${where}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, filter.pageSize, offset],
    );

    const items: EmployeeListItem[] = rows.map((r) => ({
      id: String(r.id),
      employeeCode: String(r.employee_code),
      fullName: `${r.first_name} ${r.last_name}`,
      email: String(r.email),
      phone: String(r.phone),
      department: String(r.department_name),
      designation: String(r.designation_name),
      siteName: r.site_name ? String(r.site_name) : null,
      status: Number(r.status) as EmployeeStatus,
      joiningDate: formatDate(String(r.joining_date))!,
      profilePhotoUrl: r.profile_photo_url ? String(r.profile_photo_url) : null,
    }));

    return createPaginatedResult(items, parseInt(countResult.rows[0].count, 10), filter.page, filter.pageSize);
  }

  async findById(id: string): Promise<EmployeeDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${this.detailSelect} FROM employees e
       INNER JOIN departments d ON d.id = e.department_id
       INNER JOIN designations des ON des.id = e.designation_id
       LEFT JOIN employees rm ON rm.id = e.reporting_manager_id
       LEFT JOIN sites s ON s.id = e.site_id
       WHERE e.id = $1 AND NOT e.is_deleted`,
      [id],
    );

    const r = rows[0];
    if (!r) return null;

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
      status: Number(r.status) as EmployeeStatus,
      employmentType: Number(r.employment_type),
      departmentId: String(r.department_code),
      departmentName: String(r.department_name),
      designationId: String(r.designation_code),
      designationName: String(r.designation_name),
      reportingManagerId: r.reporting_manager_id ? String(r.reporting_manager_id) : null,
      reportingManagerName:
        r.rm_first_name && r.rm_last_name
          ? `${r.rm_first_name} ${r.rm_last_name}`
          : null,
      siteId: r.site_id ? String(r.site_id) : null,
      siteName: r.site_name ? String(r.site_name) : null,
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
      createdAt: formatDateTime(r.created_at as Date)!,
      updatedAt: formatDateTime(r.updated_at as Date | null),
    };
  }

  async emailExists(email: string, excludeId?: string): Promise<boolean> {
    const params: unknown[] = [email];
    let sql = 'SELECT 1 FROM employees WHERE email = $1 AND NOT is_deleted';
    if (excludeId) {
      sql += ' AND id != $2';
      params.push(excludeId);
    }
    const { rows } = await query(sql, params);
    return rows.length > 0;
  }

  async getNextEmployeeCode(): Promise<string> {
    const { rows } = await query<{ employee_code: string }>(
      `SELECT employee_code FROM employees WHERE NOT is_deleted ORDER BY created_at DESC LIMIT 1`,
    );
    let nextNumber = 1001;
    const lastCode = rows[0]?.employee_code;
    if (lastCode?.startsWith('EMP')) {
      const parsed = parseInt(lastCode.slice(3), 10);
      if (!Number.isNaN(parsed)) nextNumber = parsed + 1;
    }
    return `EMP${String(nextNumber).padStart(4, '0')}`;
  }

  async create(input: CreateEmployeeInput): Promise<string> {
    const departmentId = await resolveDepartmentId(input.departmentId);
    const designationId = await resolveDesignationId(input.designationId);
    const employeeCode = await this.getNextEmployeeCode();

    const { rows } = await query<{ id: string }>(
      `INSERT INTO employees (
        employee_code, first_name, last_name, email, phone, alternate_phone,
        date_of_birth, gender, joining_date, employment_type, status,
        department_id, designation_id, reporting_manager_id, site_id,
        present_address, permanent_address, city, state, pin_code,
        basic_salary, gross_salary, created_by
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      ) RETURNING id`,
      [
        employeeCode,
        input.firstName,
        input.lastName,
        input.email,
        input.phone,
        input.alternatePhone ?? null,
        input.dateOfBirth,
        input.gender,
        input.joiningDate,
        input.employmentType,
        EmployeeStatus.Probation,
        departmentId,
        designationId,
        parseOptionalUuid(input.reportingManagerId),
        parseOptionalUuid(input.siteId),
        input.presentAddress ?? null,
        input.permanentAddress ?? null,
        input.city ?? null,
        input.state ?? null,
        input.pinCode ?? null,
        input.basicSalary,
        input.grossSalary,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async update(input: UpdateEmployeeInput): Promise<void> {
    const departmentId = await resolveDepartmentId(input.departmentId);
    const designationId = await resolveDesignationId(input.designationId);

    await query(
      `UPDATE employees SET
        first_name = $2, last_name = $3, phone = $4, alternate_phone = $5,
        date_of_birth = $6, gender = $7, status = $8, employment_type = $9,
        department_id = $10, designation_id = $11, reporting_manager_id = $12, site_id = $13,
        present_address = $14, permanent_address = $15, city = $16, state = $17, pin_code = $18,
        bank_name = $19, account_number = $20, ifsc_code = $21, account_holder_name = $22,
        pf_number = $23, esi_number = $24, pan_number = $25, aadhaar_number = $26, uan_number = $27,
        basic_salary = $28, gross_salary = $29, updated_at = NOW(), updated_by = $30
       WHERE id = $1 AND NOT is_deleted`,
      [
        input.id,
        input.firstName,
        input.lastName,
        input.phone,
        input.alternatePhone ?? null,
        input.dateOfBirth,
        input.gender,
        input.status,
        input.employmentType,
        departmentId,
        designationId,
        parseOptionalUuid(input.reportingManagerId),
        parseOptionalUuid(input.siteId),
        input.presentAddress ?? null,
        input.permanentAddress ?? null,
        input.city ?? null,
        input.state ?? null,
        input.pinCode ?? null,
        input.bankName ?? null,
        input.accountNumber ?? null,
        input.ifscCode ?? null,
        input.accountHolderName ?? null,
        input.pfNumber ?? null,
        input.esiNumber ?? null,
        input.panNumber ?? null,
        input.aadhaarNumber ?? null,
        input.uanNumber ?? null,
        input.basicSalary,
        input.grossSalary,
        input.createdBy,
      ],
    );
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    await query(
      `UPDATE employees SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, deletedBy],
    );
  }
}

export const employeeRepository = new EmployeeRepository();
