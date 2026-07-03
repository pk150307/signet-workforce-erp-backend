import { PoolClient, QueryResultRow } from 'pg';
import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { InvoiceStatus } from '../../types/enums';
import { formatDateTime } from '../../utils/formatters';
import {
  InvoiceActivityEntry,
  InvoiceAuditFilter,
  InvoiceAuditLogDto,
  InvoiceHistoryDto,
  LogInvoiceAuditInput,
} from './invoice-audit.types';

const STATUS_LABELS: Record<number, string> = {
  [InvoiceStatus.Draft]: 'Draft',
  [InvoiceStatus.Sent]: 'Sent',
  [InvoiceStatus.Viewed]: 'Viewed',
  [InvoiceStatus.PartiallyPaid]: 'Partially Paid',
  [InvoiceStatus.Paid]: 'Paid',
  [InvoiceStatus.Overdue]: 'Overdue',
  [InvoiceStatus.Cancelled]: 'Cancelled',
  [InvoiceStatus.Generated]: 'Generated',
  [InvoiceStatus.Approved]: 'Approved',
  [InvoiceStatus.Archived]: 'Archived',
};

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

function mapAuditRow(row: Record<string, unknown>): InvoiceAuditLogDto {
  return {
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
    clientName: row.client_name ? String(row.client_name) : null,
    action: String(row.action),
    oldValues: parseJson(row.old_values),
    newValues: parseJson(row.new_values),
    userId: row.user_id ? String(row.user_id) : null,
    userName: row.user_name ? String(row.user_name) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    browser: row.browser ? String(row.browser) : null,
    operatingSystem: row.operating_system ? String(row.operating_system) : null,
    createdAt:
      formatDateTime(String(row.created_at)) ?? new Date(String(row.created_at)).toISOString(),
    createdBy: String(row.created_by),
  };
}

function mapHistoryRow(row: Record<string, unknown>): InvoiceHistoryDto {
  return {
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    versionNumber: Number(row.version_number),
    changeType: String(row.change_type),
    changeSummary: row.change_summary ? String(row.change_summary) : null,
    snapshot: parseJson(row.snapshot) ?? {},
    createdAt:
      formatDateTime(String(row.created_at)) ?? new Date(String(row.created_at)).toISOString(),
    createdBy: String(row.created_by),
  };
}

export class InvoiceAuditRepository {
  private buildConditions(filter: InvoiceAuditFilter): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter.invoiceId) {
      conditions.push(`al.invoice_id = $${idx++}::uuid`);
      params.push(filter.invoiceId);
    }
    if (filter.action) {
      conditions.push(`al.action = $${idx++}`);
      params.push(filter.action);
    }
    if (filter.createdBy) {
      conditions.push(`LOWER(al.created_by) = LOWER($${idx++})`);
      params.push(filter.createdBy);
    }
    if (filter.fromDate) {
      conditions.push(`al.created_at >= $${idx++}`);
      params.push(filter.fromDate);
    }
    if (filter.toDate) {
      conditions.push(`al.created_at <= $${idx++}`);
      params.push(`${filter.toDate}T23:59:59.999Z`);
    }
    if (filter.clientId) {
      conditions.push(`i.client_id = $${idx++}::uuid`);
      params.push(filter.clientId);
    }
    if (filter.search) {
      conditions.push(
        `(LOWER(al.action) LIKE $${idx} OR LOWER(al.created_by) LIKE $${idx} OR LOWER(i.invoice_number) LIKE $${idx})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      idx++;
    }

    const where = conditions.length ? conditions.join(' AND ') : 'TRUE';
    return { where, params };
  }

  private baseSelect = `
    SELECT al.*, i.invoice_number, c.company_name AS client_name,
           COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.full_name, u.username) AS user_name
    FROM invoice_audit_logs al
    INNER JOIN invoices i ON i.id = al.invoice_id
    INNER JOIN clients c ON c.id = i.client_id
    LEFT JOIN users u ON u.id = al.user_id
  `;

  async log(input: LogInvoiceAuditInput, client?: PoolClient): Promise<void> {
    const sql = `INSERT INTO invoice_audit_logs (
      invoice_id, action, old_values, new_values, user_id,
      ip_address, user_agent, browser, operating_system, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`;

    const params = [
      input.invoiceId,
      input.action,
      input.oldValues ? JSON.stringify(input.oldValues) : null,
      input.newValues ? JSON.stringify(input.newValues) : null,
      input.userId ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.browser ?? null,
      input.operatingSystem ?? null,
      input.createdBy,
    ];

    if (client) {
      await client.query(sql, params);
      return;
    }
    await query(sql, params);
  }

  async findAll(filter: InvoiceAuditFilter): Promise<PaginatedResult<InvoiceAuditLogDto>> {
    const { where, params } = this.buildConditions(filter);
    let idx = params.length + 1;

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM invoice_audit_logs al
       INNER JOIN invoices i ON i.id = al.invoice_id
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `${this.baseSelect}
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map(mapAuditRow),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async findById(id: string): Promise<InvoiceAuditLogDto | null> {
    const { rows } = await query<Record<string, unknown>>(
      `${this.baseSelect} WHERE al.id = $1`,
      [id],
    );
    const row = rows[0];
    return row ? mapAuditRow(row) : null;
  }

  async findByInvoiceId(invoiceId: string, page: number, pageSize: number) {
    return this.findAll({ page, pageSize, invoiceId });
  }

  async listActions(): Promise<string[]> {
    const { rows } = await query<{ action: string }>(
      `SELECT DISTINCT action FROM invoice_audit_logs ORDER BY action`,
    );
    return rows.map((row) => row.action);
  }

  async findHistoryByInvoiceId(invoiceId: string): Promise<InvoiceHistoryDto[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, invoice_id, version_number, change_type, snapshot, change_summary, created_at, created_by
       FROM invoice_history
       WHERE invoice_id = $1
       ORDER BY version_number DESC, created_at DESC`,
      [invoiceId],
    );
    return rows.map(mapHistoryRow);
  }

  async findHistoryById(id: string): Promise<InvoiceHistoryDto | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, invoice_id, version_number, change_type, snapshot, change_summary, created_at, created_by
       FROM invoice_history WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    return row ? mapHistoryRow(row) : null;
  }

  async getActivityFeed(invoiceId: string, limit = 100): Promise<InvoiceActivityEntry[]> {
    const { rows: auditRows } = await query<Record<string, unknown>>(
      `SELECT id, action, old_values, new_values, created_by, created_at
       FROM invoice_audit_logs WHERE invoice_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [invoiceId, limit],
    );

    const { rows: statusRows } = await query<Record<string, unknown>>(
      `SELECT id, from_status, to_status, note, performed_by, performed_at
       FROM invoice_status_events WHERE invoice_id = $1
       ORDER BY performed_at DESC LIMIT $2`,
      [invoiceId, limit],
    );

    const { rows: historyRows } = await query<Record<string, unknown>>(
      `SELECT id, change_type, change_summary, snapshot, created_by, created_at
       FROM invoice_history WHERE invoice_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [invoiceId, limit],
    );

    const entries: InvoiceActivityEntry[] = [];

    for (const row of auditRows) {
      entries.push({
        id: String(row.id),
        type: 'audit',
        action: String(row.action),
        description: String(row.action).replace(/_/g, ' '),
        oldValues: parseJson(row.old_values),
        newValues: parseJson(row.new_values),
        performedBy: String(row.created_by),
        performedAt:
          formatDateTime(String(row.created_at)) ?? new Date(String(row.created_at)).toISOString(),
      });
    }

    for (const row of statusRows) {
      const fromStatus = row.from_status != null ? Number(row.from_status) : null;
      const toStatus = Number(row.to_status);
      const fromLabel = fromStatus != null ? STATUS_LABELS[fromStatus] ?? 'Unknown' : 'Created';
      const toLabel = STATUS_LABELS[toStatus] ?? 'Unknown';
      entries.push({
        id: String(row.id),
        type: 'status',
        action: 'status_changed',
        description: row.note
          ? String(row.note)
          : fromStatus == null
            ? `Invoice created (${toLabel})`
            : `Status: ${fromLabel} → ${toLabel}`,
        oldValues: fromStatus != null ? { status: fromStatus, statusLabel: fromLabel } : null,
        newValues: { status: toStatus, statusLabel: toLabel },
        performedBy: String(row.performed_by),
        performedAt:
          formatDateTime(String(row.performed_at)) ??
          new Date(String(row.performed_at)).toISOString(),
      });
    }

    for (const row of historyRows) {
      entries.push({
        id: String(row.id),
        type: 'history',
        action: String(row.change_type),
        description: row.change_summary
          ? String(row.change_summary)
          : `Version ${row.change_type}`,
        oldValues: null,
        newValues: parseJson(row.snapshot),
        performedBy: String(row.created_by),
        performedAt:
          formatDateTime(String(row.created_at)) ?? new Date(String(row.created_at)).toISOString(),
      });
    }

    entries.sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
    return entries.slice(0, limit);
  }

  async invoiceExists(invoiceId: string): Promise<boolean> {
    const { rows } = await query<QueryResultRow>(
      `SELECT 1 FROM invoices WHERE id = $1 AND NOT is_deleted`,
      [invoiceId],
    );
    return rows.length > 0;
  }
}

export const invoiceAuditRepository = new InvoiceAuditRepository();
