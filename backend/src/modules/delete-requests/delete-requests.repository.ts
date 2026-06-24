import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { DELETE_REQUEST_STATUS } from '../iam/iam.constants';
import {
  CreateDeleteRequestInput,
  DeleteRequestDetail,
  DeleteRequestFilter,
  DeleteRequestListItem,
} from './delete-requests.types';

const SELECT_FIELDS = `
  dr.id, dr.module, dr.entity_type, dr.entity_id, dr.entity_label, dr.reason, dr.status,
  dr.requested_by, dr.reviewed_by, dr.rejection_remarks, dr.reviewed_at, dr.soft_deleted_at,
  dr.entity_snapshot, dr.created_at, dr.created_by, dr.updated_at, dr.updated_by,
  ru.email AS requested_by_email,
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', ru.first_name, ru.last_name)), ''), ru.full_name, ru.username) AS requested_by_name,
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', rv.first_name, rv.last_name)), ''), rv.full_name, rv.username) AS reviewed_by_name
`;

export class DeleteRequestsRepository {
  private buildConditions(filter: DeleteRequestFilter): { where: string; params: unknown[] } {
    const conditions = ['NOT dr.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.status) {
      conditions.push(`dr.status = $${i++}`);
      params.push(filter.status);
    }
    if (filter.module) {
      conditions.push(`dr.module = $${i++}`);
      params.push(filter.module);
    }
    if (filter.entityType) {
      conditions.push(`dr.entity_type = $${i++}`);
      params.push(filter.entityType);
    }
    if (filter.requestedBy) {
      conditions.push(`dr.requested_by = $${i++}`);
      params.push(filter.requestedBy);
    }
    if (filter.reviewedBy) {
      conditions.push(`dr.reviewed_by = $${i++}`);
      params.push(filter.reviewedBy);
    }
    if (filter.dateFrom) {
      conditions.push(`dr.created_at >= $${i++}`);
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      conditions.push(`dr.created_at <= $${i++}`);
      params.push(filter.dateTo);
    }
    if (filter.search) {
      conditions.push(
        `(LOWER(COALESCE(dr.entity_label, '')) LIKE $${i}
          OR LOWER(dr.module) LIKE $${i}
          OR LOWER(dr.entity_type) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    return { where: conditions.join(' AND '), params };
  }

  async findAll(filter: DeleteRequestFilter): Promise<PaginatedResult<DeleteRequestListItem>> {
    const { where, params } = this.buildConditions(filter);
    let i = params.length + 1;

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM delete_requests dr WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM delete_requests dr
       LEFT JOIN users ru ON ru.id = dr.requested_by
       LEFT JOIN users rv ON rv.id = dr.reviewed_by
       WHERE ${where}
       ORDER BY dr.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map((r) => this.mapListItem(r)),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async findById(id: string): Promise<DeleteRequestDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM delete_requests dr
       LEFT JOIN users ru ON ru.id = dr.requested_by
       LEFT JOIN users rv ON rv.id = dr.reviewed_by
       WHERE dr.id = $1 AND NOT dr.is_deleted`,
      [id],
    );
    if (!rows[0]) return null;
    return this.mapDetail(rows[0]);
  }

  async hasPendingRequest(module: string, entityType: string, entityId: string): Promise<boolean> {
    const { rows } = await query(
      `SELECT 1 FROM delete_requests
       WHERE module = $1 AND entity_type = $2 AND entity_id = $3
         AND status = $4 AND NOT is_deleted`,
      [module, entityType, entityId, DELETE_REQUEST_STATUS.PENDING],
    );
    return rows.length > 0;
  }

  async create(input: CreateDeleteRequestInput): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO delete_requests (
        module, entity_type, entity_id, entity_label, reason, entity_snapshot,
        requested_by, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        input.module,
        input.entityType,
        input.entityId,
        input.entityLabel ?? null,
        input.reason,
        input.entitySnapshot ? JSON.stringify(input.entitySnapshot) : null,
        input.requestedByUserId,
        DELETE_REQUEST_STATUS.PENDING,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async approve(id: string, reviewedByUserId: string, reviewedByUsername: string): Promise<void> {
    await query(
      `UPDATE delete_requests
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(), soft_deleted_at = NOW(),
           updated_at = NOW(), updated_by = $4
       WHERE id = $1 AND status = $5 AND NOT is_deleted`,
      [
        id,
        DELETE_REQUEST_STATUS.APPROVED,
        reviewedByUserId,
        reviewedByUsername,
        DELETE_REQUEST_STATUS.PENDING,
      ],
    );
  }

  async reject(
    id: string,
    reviewedByUserId: string,
    reviewedByUsername: string,
    rejectionRemarks: string,
  ): Promise<void> {
    await query(
      `UPDATE delete_requests
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(), rejection_remarks = $4,
           updated_at = NOW(), updated_by = $5
       WHERE id = $1 AND status = $6 AND NOT is_deleted`,
      [
        id,
        DELETE_REQUEST_STATUS.REJECTED,
        reviewedByUserId,
        rejectionRemarks,
        reviewedByUsername,
        DELETE_REQUEST_STATUS.PENDING,
      ],
    );
  }

  async getSuperAdminUserIds(): Promise<string[]> {
    const { rows } = await query<{ id: string }>(
      `SELECT DISTINCT u.id
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id AND NOT ur.is_deleted
       INNER JOIN roles r ON r.id = ur.role_id AND r.name = 'Super Admin' AND NOT r.is_deleted
       WHERE u.is_active AND NOT u.is_deleted`,
    );
    return rows.map((r) => r.id);
  }

  private mapListItem(r: Record<string, unknown>): DeleteRequestListItem {
    return {
      id: String(r.id),
      module: String(r.module),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      entityLabel: r.entity_label ? String(r.entity_label) : null,
      reason: String(r.reason),
      status: String(r.status),
      requestedBy: String(r.requested_by),
      requestedByName: r.requested_by_name ? String(r.requested_by_name) : null,
      requestedByEmail: r.requested_by_email ? String(r.requested_by_email) : null,
      reviewedBy: r.reviewed_by ? String(r.reviewed_by) : null,
      reviewedByName: r.reviewed_by_name ? String(r.reviewed_by_name) : null,
      rejectionRemarks: r.rejection_remarks ? String(r.rejection_remarks) : null,
      reviewedAt: r.reviewed_at ? new Date(String(r.reviewed_at)).toISOString() : null,
      softDeletedAt: r.soft_deleted_at ? new Date(String(r.soft_deleted_at)).toISOString() : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      createdBy: String(r.created_by),
    };
  }

  private mapDetail(r: Record<string, unknown>): DeleteRequestDetail {
    const snapshot = r.entity_snapshot;
    return {
      ...this.mapListItem(r),
      entitySnapshot:
        snapshot && typeof snapshot === 'object' ? (snapshot as Record<string, unknown>) : null,
      updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
      updatedBy: r.updated_by ? String(r.updated_by) : null,
    };
  }
}

export const deleteRequestsRepository = new DeleteRequestsRepository();
