import { query } from '../../database/pool';
import { NotFoundError } from '../../common/errors';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { parseOptionalUuid, resolveClientId } from '../../utils/organization';
import { buildNextSequentialCode } from '../../utils/code-sequence';
import {
  CreateDepartmentInput,
  DepartmentDetail,
  DepartmentFilter,
  DepartmentListItem,
  UpdateDepartmentInput,
} from './department.types';

const EMPLOYEE_COUNT_SQL = `
  (SELECT COUNT(*)::int FROM employees e
   WHERE NOT e.is_deleted AND e.department_id = d.id)
`;

export class DepartmentRepository {
  private baseFrom = `
    FROM departments d
    INNER JOIN clients c ON c.id = d.client_id AND NOT c.is_deleted
    LEFT JOIN employees hod ON hod.id = d.head_of_department_id AND NOT hod.is_deleted
    WHERE NOT d.is_deleted
  `;

  async findAll(filter: DepartmentFilter): Promise<PaginatedResult<DepartmentListItem>> {
    const { extra, params, nextIndex } = await this.buildFilter(filter);

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count ${this.baseFrom}${extra}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT d.id, d.client_id, c.company_name AS client_name,
              d.code, d.name, d.description, d.is_active, d.head_of_department_id,
              TRIM(CONCAT(hod.first_name, ' ', hod.last_name)) AS head_name,
              ${EMPLOYEE_COUNT_SQL} AS employee_count
       ${this.baseFrom}${extra}
       ORDER BY c.company_name, d.name
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

  async findById(id: string): Promise<DepartmentDetail | null> {
    const { clause, param } = this.idClause(id);
    const { rows } = await query<Record<string, unknown>>(
      `SELECT d.id, d.client_id, c.company_name AS client_name,
              d.code, d.name, d.description, d.is_active, d.head_of_department_id,
              TRIM(CONCAT(hod.first_name, ' ', hod.last_name)) AS head_name,
              ${EMPLOYEE_COUNT_SQL} AS employee_count
       ${this.baseFrom} AND ${clause}`,
      [param],
    );
    return rows[0] ? this.mapDetail(rows[0]) : null;
  }

  async getNextDepartmentCode(clientId: string): Promise<string> {
    const resolvedClientId = await resolveClientId(clientId);
    const { rows } = await query<{ code: string }>(
      `SELECT code FROM departments
       WHERE client_id = $1::uuid AND NOT is_deleted`,
      [resolvedClientId],
    );
    return buildNextSequentialCode(rows.map((r) => r.code), 'dept', 3);
  }

  async create(input: CreateDepartmentInput): Promise<{ id: string }> {
    const clientId = await resolveClientId(input.clientId);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO departments (client_id, code, name, description, head_of_department_id, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        clientId,
        input.departmentCode.trim(),
        input.departmentName.trim(),
        input.description?.trim() || null,
        input.headOfDepartmentId || null,
        input.isActive ?? true,
        input.createdBy,
      ],
    );
    return { id: rows[0].id };
  }

  async update(input: UpdateDepartmentInput): Promise<void> {
    const resolvedId = await this.resolveId(input.id);
    await query(
      `UPDATE departments SET
        code = $2, name = $3, description = $4, head_of_department_id = $5,
        is_active = COALESCE($6, is_active), updated_at = NOW(), updated_by = $7
       WHERE id = $1 AND NOT is_deleted`,
      [
        resolvedId,
        input.departmentCode.trim(),
        input.departmentName.trim(),
        input.description?.trim() || null,
        input.headOfDepartmentId || null,
        input.isActive ?? null,
        input.createdBy,
      ],
    );
  }

  async softDelete(id: string, deletedBy: string): Promise<boolean> {
    const resolvedId = await this.resolveId(id);
    const { rowCount } = await query(
      `UPDATE departments SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND NOT is_deleted`,
      [resolvedId, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async resolveId(id: string, clientId?: string): Promise<string> {
    const uuid = parseOptionalUuid(id);
    if (uuid) {
      const params: unknown[] = [uuid];
      let extra = '';
      if (clientId) {
        extra = ' AND client_id = $2::uuid';
        params.push(await resolveClientId(clientId));
      }
      const byUuid = await query<{ id: string }>(
        `SELECT id FROM departments WHERE id = $1::uuid AND NOT is_deleted${extra}`,
        params,
      );
      if (byUuid.rows[0]) return byUuid.rows[0].id;
    }

    const params: unknown[] = [id];
    let extra = '';
    if (clientId) {
      extra = ' AND client_id = $2::uuid';
      params.push(await resolveClientId(clientId));
    }
    const byCode = await query<{ id: string }>(
      `SELECT id FROM departments WHERE code = $1 AND NOT is_deleted${extra} ORDER BY created_at LIMIT 1`,
      params,
    );
    if (byCode.rows[0]) return byCode.rows[0].id;

    throw new NotFoundError('Department', id);
  }

  private idClause(id: string): { clause: string; param: string } {
    const uuid = parseOptionalUuid(id);
    if (uuid) {
      return { clause: 'd.id = $1::uuid', param: uuid };
    }
    return { clause: 'd.code = $1', param: id };
  }

  private async buildFilter(
    filter: DepartmentFilter,
  ): Promise<{ extra: string; params: unknown[]; nextIndex: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (filter.clientId) {
      conditions.push(`d.client_id = $${i++}::uuid`);
      params.push(await resolveClientId(filter.clientId));
    }

    if (filter.search) {
      conditions.push(`(LOWER(d.name) LIKE $${i} OR LOWER(d.code) LIKE $${i})`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`d.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    const extra = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
    return { extra, params, nextIndex: i };
  }

  private mapListItem(r: Record<string, unknown>): DepartmentListItem {
    const headName = String(r.head_name ?? '').trim();
    return {
      id: String(r.id),
      clientId: String(r.client_id),
      clientName: r.client_name ? String(r.client_name) : null,
      departmentCode: String(r.code),
      departmentName: String(r.name),
      parentDepartmentName: null,
      headOfDepartment: headName || null,
      employeeCount: Number(r.employee_count ?? 0),
      isActive: Boolean(r.is_active),
    };
  }

  private mapDetail(r: Record<string, unknown>): DepartmentDetail {
    return {
      ...this.mapListItem(r),
      description: r.description ? String(r.description) : null,
      parentDepartmentId: null,
      headOfDepartmentId: r.head_of_department_id ? String(r.head_of_department_id) : null,
    };
  }
}

export const departmentRepository = new DepartmentRepository();
