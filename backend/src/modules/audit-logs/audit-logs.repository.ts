import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import {
  AUDIT_LOG_EXPORT_HEADERS,
  AUDIT_LOG_EXPORT_MAX_ROWS,
  AuditLogDetail,
  AuditLogFilter,
  AuditLogListItem,
  AuditLogSummary,
} from './audit-logs.types';

const SELECT_FIELDS = `
  al.id, al.user_id, al.module, al.action, al.entity_type, al.entity_id,
  al.old_values, al.new_values, al.ip_address, al.user_agent, al.browser,
  al.operating_system, al.request_id, al.created_at, al.created_by,
  al.updated_at, al.updated_by,
  u.email AS user_email,
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.full_name, u.username) AS user_name
`;

function parseJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function escapeCsv(value: unknown): string {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export class AuditLogsRepository {
  private buildConditions(filter: AuditLogFilter): { where: string; params: unknown[] } {
    const conditions = ['NOT al.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.userId) {
      conditions.push(`al.user_id = $${i++}`);
      params.push(filter.userId);
    }
    if (filter.module) {
      conditions.push(`al.module = $${i++}`);
      params.push(filter.module);
    }
    if (filter.action) {
      conditions.push(`al.action = $${i++}`);
      params.push(filter.action);
    }
    if (filter.entityType) {
      conditions.push(`al.entity_type = $${i++}`);
      params.push(filter.entityType);
    }
    if (filter.entityId) {
      conditions.push(`al.entity_id = $${i++}`);
      params.push(filter.entityId);
    }
    if (filter.dateFrom) {
      conditions.push(`al.created_at >= $${i++}`);
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      conditions.push(`al.created_at <= $${i++}`);
      params.push(filter.dateTo);
    }
    if (filter.ipAddress) {
      conditions.push(`al.ip_address = $${i++}`);
      params.push(filter.ipAddress);
    }
    if (filter.search) {
      conditions.push(
        `(LOWER(COALESCE(u.email, '')) LIKE $${i}
          OR LOWER(COALESCE(u.username, '')) LIKE $${i}
          OR LOWER(COALESCE(al.module, '')) LIKE $${i}
          OR LOWER(al.action) LIKE $${i}
          OR LOWER(al.entity_type) LIKE $${i}
          OR COALESCE(al.ip_address, '') LIKE $${i}
          OR LOWER(al.created_by) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    return { where: conditions.join(' AND '), params };
  }

  private mapListItem(r: Record<string, unknown>): AuditLogListItem {
    return {
      id: String(r.id),
      userId: r.user_id ? String(r.user_id) : null,
      userEmail: r.user_email ? String(r.user_email) : null,
      userName: r.user_name ? String(r.user_name) : null,
      module: r.module ? String(r.module) : null,
      action: String(r.action),
      entityType: String(r.entity_type),
      entityId: r.entity_id ? String(r.entity_id) : null,
      ipAddress: r.ip_address ? String(r.ip_address) : null,
      browser: r.browser ? String(r.browser) : null,
      operatingSystem: r.operating_system ? String(r.operating_system) : null,
      requestId: r.request_id ? String(r.request_id) : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
      createdBy: String(r.created_by),
    };
  }

  private mapDetail(r: Record<string, unknown>): AuditLogDetail {
    return {
      ...this.mapListItem(r),
      oldValues: parseJson(r.old_values),
      newValues: parseJson(r.new_values),
      userAgent: r.user_agent ? String(r.user_agent) : null,
      updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
      updatedBy: r.updated_by ? String(r.updated_by) : null,
    };
  }

  async findAll(filter: AuditLogFilter): Promise<PaginatedResult<AuditLogListItem>> {
    const { where, params } = this.buildConditions(filter);
    let i = params.length + 1;

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       ORDER BY al.created_at DESC
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

  async findById(id: string): Promise<AuditLogDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.id = $1 AND NOT al.is_deleted`,
      [id],
    );
    if (!rows[0]) return null;
    return this.mapDetail(rows[0]);
  }

  async getSummary(filter: Pick<AuditLogFilter, 'dateFrom' | 'dateTo' | 'module' | 'userId'>): Promise<AuditLogSummary> {
    const { where, params } = this.buildConditions({
      page: 1,
      pageSize: 1,
      ...filter,
    });

    const totals = await query<{
      total_logs: string;
      last_24_hours: string;
      last_7_days: string;
    }>(
      `SELECT
         COUNT(*) AS total_logs,
         COUNT(*) FILTER (WHERE al.created_at >= NOW() - INTERVAL '24 hours') AS last_24_hours,
         COUNT(*) FILTER (WHERE al.created_at >= NOW() - INTERVAL '7 days') AS last_7_days
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}`,
      params,
    );

    const byModule = await query<{ module: string; count: string }>(
      `SELECT COALESCE(al.module, 'Unknown') AS module, COUNT(*) AS count
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       GROUP BY COALESCE(al.module, 'Unknown')
       ORDER BY count DESC
       LIMIT 10`,
      params,
    );

    const byAction = await query<{ action: string; count: string }>(
      `SELECT al.action, COUNT(*) AS count
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       GROUP BY al.action
       ORDER BY count DESC
       LIMIT 10`,
      params,
    );

    const row = totals.rows[0];
    return {
      totalLogs: parseInt(row.total_logs, 10),
      last24Hours: parseInt(row.last_24_hours, 10),
      last7Days: parseInt(row.last_7_days, 10),
      byModule: byModule.rows.map((r) => ({
        module: String(r.module),
        count: parseInt(r.count, 10),
      })),
      byAction: byAction.rows.map((r) => ({
        action: String(r.action),
        count: parseInt(r.count, 10),
      })),
    };
  }

  async exportCsv(filter: AuditLogFilter): Promise<string> {
    const { where, params } = this.buildConditions(filter);

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT ${AUDIT_LOG_EXPORT_MAX_ROWS}`,
      params,
    );

    const lines = [AUDIT_LOG_EXPORT_HEADERS.join(',')];
    for (const r of rows) {
      const item = this.mapListItem(r);
      lines.push(
        [
          item.createdAt,
          item.userName ?? '',
          item.userEmail ?? '',
          item.module ?? '',
          item.action,
          item.entityType,
          item.entityId ?? '',
          item.ipAddress ?? '',
          item.browser ?? '',
          item.operatingSystem ?? '',
          item.createdBy,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    return lines.join('\n');
  }
}

export const auditLogsRepository = new AuditLogsRepository();
