import { query } from '../../database/pool';
import { NotFoundError } from '../../common/errors';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { parseOptionalUuid, resolveClientId, resolveDepartmentId } from '../../utils/organization';
import { buildNextSequentialCode } from '../../utils/code-sequence';
import {
  CreateDesignationInput,
  DesignationDetail,
  DesignationFilter,
  DesignationListItem,
  UpdateDesignationInput,
} from './designation.types';

const EMPLOYEE_COUNT_SQL = `
  (SELECT COUNT(*)::int FROM employees e
   WHERE NOT e.is_deleted AND e.designation_id = des.id)
`;

const GRADE_COUNT_SQL = `
  (SELECT COUNT(*)::int FROM designation_grades dg
   WHERE dg.designation_id = des.id AND NOT dg.is_deleted AND dg.is_active)
`;

export class DesignationRepository {
  private baseFrom = `
    FROM designations des
    LEFT JOIN departments d ON d.id = des.department_id AND NOT d.is_deleted
    LEFT JOIN clients c ON c.id = d.client_id AND NOT c.is_deleted
    WHERE NOT des.is_deleted
  `;

  async findAll(filter: DesignationFilter): Promise<PaginatedResult<DesignationListItem>> {
    const { extra, params, nextIndex } = await this.buildFilter(filter);

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count ${this.baseFrom}${extra}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT des.id, des.code, des.name, des.is_active, des.department_id,
              d.name AS department_name, d.client_id, c.company_name AS client_name,
              ${EMPLOYEE_COUNT_SQL} AS employee_count,
              ${GRADE_COUNT_SQL} AS grade_count
       ${this.baseFrom}${extra}
       ORDER BY c.company_name, d.name, des.name
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

  async findById(id: string): Promise<DesignationDetail | null> {
    const { clause, param } = this.idClause(id);
    const { rows } = await query<Record<string, unknown>>(
      `SELECT des.id, des.code, des.name, des.is_active, des.department_id,
              d.name AS department_name, d.client_id, c.company_name AS client_name,
              ${EMPLOYEE_COUNT_SQL} AS employee_count,
              ${GRADE_COUNT_SQL} AS grade_count
       ${this.baseFrom} AND ${clause}`,
      [param],
    );
    return rows[0] ? this.mapDetail(rows[0]) : null;
  }

  async getNextDesignationCode(departmentId: string): Promise<string> {
    const resolvedDepartmentId = await resolveDepartmentId(departmentId);
    const { rows } = await query<{ code: string }>(
      `SELECT code FROM designations
       WHERE department_id = $1::uuid AND NOT is_deleted`,
      [resolvedDepartmentId],
    );
    return buildNextSequentialCode(rows.map((r) => r.code), 'des', 3);
  }

  async create(input: CreateDesignationInput): Promise<{ id: string }> {
    const departmentId = await resolveDepartmentId(input.departmentId);

    const { rows } = await query<{ id: string }>(
      `INSERT INTO designations (code, name, department_id, level, is_active, created_by)
       VALUES ($1, $2, $3, 1, $4, $5)
       RETURNING id`,
      [
        input.designationCode.trim(),
        input.designationName.trim(),
        departmentId,
        input.isActive ?? true,
        input.createdBy,
      ],
    );
    return { id: rows[0].id };
  }

  async update(input: UpdateDesignationInput): Promise<void> {
    const resolvedId = await this.resolveId(input.id);
    const existing = await this.findById(input.id);
    if (!existing) throw new NotFoundError('Designation', input.id);

    const departmentRef = input.departmentId?.trim() || existing.departmentId;
    if (!departmentRef) throw new NotFoundError('Department', 'unknown');
    const departmentId = await resolveDepartmentId(departmentRef);

    await query(
      `UPDATE designations SET
        code = $2, name = $3, department_id = $4,
        is_active = COALESCE($5, is_active), updated_at = NOW(), updated_by = $6
       WHERE id = $1 AND NOT is_deleted`,
      [
        resolvedId,
        input.designationCode.trim(),
        input.designationName.trim(),
        departmentId,
        input.isActive ?? null,
        input.createdBy,
      ],
    );
  }

  async softDelete(id: string, deletedBy: string): Promise<boolean> {
    const resolvedId = await this.resolveId(id);
    const { rowCount } = await query(
      `UPDATE designations SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND NOT is_deleted`,
      [resolvedId, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async resolveId(id: string): Promise<string> {
    const uuid = parseOptionalUuid(id);
    if (uuid) {
      const byUuid = await query<{ id: string }>(
        `SELECT id FROM designations WHERE id = $1::uuid AND NOT is_deleted`,
        [uuid],
      );
      if (byUuid.rows[0]) return byUuid.rows[0].id;
    }

    const byCode = await query<{ id: string }>(
      `SELECT id FROM designations WHERE code = $1 AND NOT is_deleted`,
      [id],
    );
    if (byCode.rows[0]) return byCode.rows[0].id;

    throw new NotFoundError('Designation', id);
  }

  private idClause(id: string): { clause: string; param: string } {
    const uuid = parseOptionalUuid(id);
    if (uuid) {
      return { clause: 'des.id = $1::uuid', param: uuid };
    }
    return { clause: 'des.code = $1', param: id };
  }

  private async buildFilter(
    filter: DesignationFilter,
  ): Promise<{ extra: string; params: unknown[]; nextIndex: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (filter.clientId) {
      conditions.push(`d.client_id = $${i++}::uuid`);
      params.push(await resolveClientId(filter.clientId));
    }

    if (filter.search) {
      conditions.push(`(LOWER(des.name) LIKE $${i} OR LOWER(des.code) LIKE $${i})`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.departmentId) {
      const departmentId = await resolveDepartmentId(filter.departmentId);
      conditions.push(`des.department_id = $${i++}::uuid`);
      params.push(departmentId);
    }

    if (filter.gradeCode) {
      conditions.push(`EXISTS (
        SELECT 1 FROM designation_grades dg
        WHERE dg.designation_id = des.id AND NOT dg.is_deleted
          AND LOWER(dg.code) = LOWER($${i++})
      )`);
      params.push(filter.gradeCode.trim());
    }

    if (filter.isActive !== undefined) {
      conditions.push(`des.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    const extra = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
    return { extra, params, nextIndex: i };
  }

  private mapListItem(r: Record<string, unknown>): DesignationListItem {
    return {
      id: String(r.id),
      designationCode: String(r.code),
      designationName: String(r.name),
      parentDesignationName: null,
      clientId: r.client_id ? String(r.client_id) : null,
      clientName: r.client_name ? String(r.client_name) : null,
      departmentName: r.department_name ? String(r.department_name) : null,
      departmentId: r.department_id ? String(r.department_id) : null,
      gradeCount: Number(r.grade_count ?? 0),
      employeeCount: Number(r.employee_count ?? 0),
      isActive: Boolean(r.is_active),
    };
  }

  private mapDetail(r: Record<string, unknown>): DesignationDetail {
    return {
      ...this.mapListItem(r),
      description: null,
      parentDesignationId: null,
    };
  }
}

export const designationRepository = new DesignationRepository();
