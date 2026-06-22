import { query } from '../../database/pool';
import { NotFoundError } from '../../common/errors';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { parseOptionalUuid, resolveClientId, resolveDepartmentId, resolveDesignationId } from '../../utils/organization';
import { computeGradeGross } from './designation-grade.types';
import {
  CreateDesignationGradeInput,
  DesignationGradeDetail,
  DesignationGradeFilter,
  DesignationGradeListItem,
  UpdateDesignationGradeInput,
} from './designation-grade.types';

const EMPLOYEE_COUNT_SQL = `
  (SELECT COUNT(*)::int FROM employees e
   WHERE NOT e.is_deleted
   AND COALESCE(
     (SELECT ed.designation_grade_id FROM employee_employment_details ed
      WHERE ed.employee_id = e.id AND ed.is_current = TRUE LIMIT 1),
     e.designation_grade_id
   ) = dg.id)
`;

export class DesignationGradeRepository {
  private baseFrom = `
    FROM designation_grades dg
    INNER JOIN designations des ON des.id = dg.designation_id AND NOT des.is_deleted
    INNER JOIN departments d ON d.id = des.department_id AND NOT d.is_deleted
    INNER JOIN clients c ON c.id = d.client_id AND NOT c.is_deleted
    WHERE NOT dg.is_deleted
  `;

  async findAll(filter: DesignationGradeFilter): Promise<PaginatedResult<DesignationGradeListItem>> {
    const { extra, params, nextIndex } = await this.buildFilter(filter);

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count ${this.baseFrom}${extra}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT dg.*, des.code AS designation_code, des.name AS designation_name,
              d.id AS department_uuid, d.code AS department_code, d.name AS department_name,
              d.client_id, c.company_name AS client_name,
              ${EMPLOYEE_COUNT_SQL} AS employee_count
       ${this.baseFrom}${extra}
       ORDER BY c.company_name, d.name, des.name, dg.level, dg.code
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map((r) => this.mapListItem(r)),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async findByDesignationId(designationId: string): Promise<DesignationGradeListItem[]> {
    const resolvedId = await resolveDesignationId(designationId);
    const { rows } = await query<Record<string, unknown>>(
      `SELECT dg.*, des.code AS designation_code, des.name AS designation_name,
              d.id AS department_uuid, d.code AS department_code, d.name AS department_name,
              d.client_id, c.company_name AS client_name,
              ${EMPLOYEE_COUNT_SQL} AS employee_count
       ${this.baseFrom} AND dg.designation_id = $1::uuid
       ORDER BY dg.level, dg.code`,
      [resolvedId],
    );
    return rows.map((r) => this.mapListItem(r));
  }

  async findById(id: string): Promise<DesignationGradeDetail | null> {
    const { clause, param } = this.idClause(id);
    const { rows } = await query<Record<string, unknown>>(
      `SELECT dg.*, des.code AS designation_code, des.name AS designation_name,
              d.id AS department_uuid, d.code AS department_code, d.name AS department_name,
              d.client_id, c.company_name AS client_name,
              ${EMPLOYEE_COUNT_SQL} AS employee_count
       ${this.baseFrom} AND ${clause}`,
      [param],
    );
    return rows[0] ? this.mapListItem(rows[0]) : null;
  }

  async create(input: CreateDesignationGradeInput): Promise<{ id: string }> {
    const designationId = await resolveDesignationId(input.designationId);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO designation_grades (
        designation_id, code, name, level,
        basic_salary, house_rent_allowance, special_allowance,
        is_pf_applicable, is_esi_applicable,
        employee_pf_percentage, employee_esi_percentage,
        employer_pf_percentage, employer_esi_percentage,
        is_lwf_applicable, employee_lwf_percentage, employee_lwf_max_amount,
        is_active, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING id`,
      [
        designationId,
        input.gradeCode.trim(),
        input.gradeName.trim(),
        input.level ?? 1,
        input.basicSalary ?? 0,
        input.houseRentAllowance ?? 0,
        input.specialAllowance ?? 0,
        input.isPfApplicable ?? true,
        input.isEsiApplicable ?? true,
        input.employeePfPercentage ?? 12,
        input.employeeEsiPercentage ?? 0.75,
        input.employerPfPercentage ?? 12,
        input.employerEsiPercentage ?? 3.25,
        input.isLwfApplicable ?? false,
        input.employeeLwfPercentage ?? 0.2,
        input.employeeLwfMaxAmount ?? 35,
        input.isActive ?? true,
        input.createdBy,
      ],
    );
    return { id: rows[0].id };
  }

  async update(input: UpdateDesignationGradeInput): Promise<void> {
    const resolvedId = await this.resolveId(input.id);
    const designationId = await resolveDesignationId(input.designationId);
    await query(
      `UPDATE designation_grades SET
        designation_id = $2, code = $3, name = $4, level = $5,
        basic_salary = $6, house_rent_allowance = $7, special_allowance = $8,
        is_pf_applicable = $9, is_esi_applicable = $10,
        employee_pf_percentage = $11, employee_esi_percentage = $12,
        employer_pf_percentage = $13, employer_esi_percentage = $14,
        is_lwf_applicable = $15, employee_lwf_percentage = $16, employee_lwf_max_amount = $17,
        is_active = COALESCE($18, is_active), updated_at = NOW(), updated_by = $19
       WHERE id = $1 AND NOT is_deleted`,
      [
        resolvedId,
        designationId,
        input.gradeCode.trim(),
        input.gradeName.trim(),
        input.level ?? 1,
        input.basicSalary ?? 0,
        input.houseRentAllowance ?? 0,
        input.specialAllowance ?? 0,
        input.isPfApplicable ?? true,
        input.isEsiApplicable ?? true,
        input.employeePfPercentage ?? 12,
        input.employeeEsiPercentage ?? 0.75,
        input.employerPfPercentage ?? 12,
        input.employerEsiPercentage ?? 3.25,
        input.isLwfApplicable ?? false,
        input.employeeLwfPercentage ?? 0.2,
        input.employeeLwfMaxAmount ?? 35,
        input.isActive ?? null,
        input.createdBy,
      ],
    );
  }

  async softDelete(id: string, deletedBy: string): Promise<boolean> {
    const resolvedId = await this.resolveId(id);
    const { rowCount } = await query(
      `UPDATE designation_grades SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND NOT is_deleted`,
      [resolvedId, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async resolveId(id: string): Promise<string> {
    const uuid = parseOptionalUuid(id);
    if (uuid) {
      const byUuid = await query<{ id: string }>(
        `SELECT id FROM designation_grades WHERE id = $1::uuid AND NOT is_deleted`,
        [uuid],
      );
      if (byUuid.rows[0]) return byUuid.rows[0].id;
    }

    const byCode = await query<{ id: string }>(
      `SELECT dg.id FROM designation_grades dg
       WHERE dg.code = $1 AND NOT dg.is_deleted
       ORDER BY dg.created_at LIMIT 1`,
      [id],
    );
    if (byCode.rows[0]) return byCode.rows[0].id;

    throw new NotFoundError('Designation grade', id);
  }

  private idClause(id: string): { clause: string; param: string } {
    const uuid = parseOptionalUuid(id);
    if (uuid) {
      return { clause: 'dg.id = $1::uuid', param: uuid };
    }
    return { clause: 'dg.code = $1', param: id };
  }

  private async buildFilter(
    filter: DesignationGradeFilter,
  ): Promise<{ extra: string; params: unknown[]; nextIndex: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (filter.clientId) {
      conditions.push(`d.client_id = $${i++}::uuid`);
      params.push(await resolveClientId(filter.clientId));
    }

    if (filter.designationId) {
      const designationId = await resolveDesignationId(filter.designationId);
      conditions.push(`dg.designation_id = $${i++}::uuid`);
      params.push(designationId);
    }

    if (filter.departmentId) {
      const departmentId = await resolveDepartmentId(filter.departmentId);
      conditions.push(`des.department_id = $${i++}::uuid`);
      params.push(departmentId);
    }

    if (filter.search) {
      conditions.push(
        `(LOWER(dg.code) LIKE $${i} OR LOWER(dg.name) LIKE $${i} OR LOWER(des.name) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`dg.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    const extra = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
    return { extra, params, nextIndex: i };
  }

  private mapListItem(r: Record<string, unknown>): DesignationGradeListItem {
    const basicSalary = Number(r.basic_salary ?? 0);
    const houseRentAllowance = Number(r.house_rent_allowance ?? 0);
    const specialAllowance = Number(r.special_allowance ?? 0);
    return {
      id: String(r.id),
      clientId: r.client_id ? String(r.client_id) : undefined,
      clientName: r.client_name ? String(r.client_name) : undefined,
      designationId: String(r.designation_id),
      designationCode: String(r.designation_code),
      designationName: String(r.designation_name),
      departmentId: String(r.department_uuid),
      departmentName: String(r.department_name),
      gradeCode: String(r.code),
      gradeName: String(r.name),
      level: Number(r.level ?? 1),
      basicSalary,
      houseRentAllowance,
      specialAllowance,
      grossSalary: computeGradeGross({
        basicSalary,
        houseRentAllowance,
        specialAllowance,
      }),
      isPfApplicable: r.is_pf_applicable !== false,
      isEsiApplicable: r.is_esi_applicable !== false,
      employeePfPercentage: Number(r.employee_pf_percentage ?? 12),
      employeeEsiPercentage: Number(r.employee_esi_percentage ?? 0.75),
      employerPfPercentage: Number(r.employer_pf_percentage ?? 12),
      employerEsiPercentage: Number(r.employer_esi_percentage ?? 3.25),
      isLwfApplicable: Boolean(r.is_lwf_applicable),
      employeeLwfPercentage: Number(r.employee_lwf_percentage ?? 0.2),
      employeeLwfMaxAmount: Number(r.employee_lwf_max_amount ?? 35),
      employeeCount: Number(r.employee_count ?? 0),
      isActive: Boolean(r.is_active),
    };
  }
}

export const designationGradeRepository = new DesignationGradeRepository();
