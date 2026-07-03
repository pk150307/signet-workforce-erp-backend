import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { formatDate, formatDateTime, round2, toNumber } from '../../utils/formatters';
import {
  InvoicePaymentDto,
  InvoicePaymentFilter,
  PaymentMode,
  UpdateInvoicePaymentInput,
} from './invoice-payment.types';

export interface InvoicePaymentContext {
  id: string;
  invoiceNumber: string;
  status: number;
  totalAmount: number;
  paidAmount: number;
  dueDate: string;
  isLocked: boolean;
  isDeleted: boolean;
}

function mapPayment(row: Record<string, unknown>): InvoicePaymentDto {
  return {
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
    clientName: row.client_name ? String(row.client_name) : null,
    paymentDate: formatDate(row.payment_date as Date | string)!,
    amount: toNumber(row.amount as string),
    referenceNumber: row.reference_number ? String(row.reference_number) : null,
    utrNumber: row.utr_number ? String(row.utr_number) : null,
    paymentMode: String(row.payment_mode) as PaymentMode,
    remarks: row.remarks ? String(row.remarks) : null,
    createdAt:
      formatDateTime(String(row.created_at)) ?? new Date(String(row.created_at)).toISOString(),
    createdBy: String(row.created_by),
  };
}

async function runQuery<T extends QueryResultRow>(
  text: string,
  params?: unknown[],
  client?: PoolClient,
): Promise<QueryResult<T>> {
  if (client) return client.query<T>(text, params);
  return query<T>(text, params);
}

export class InvoicePaymentRepository {
  async getInvoiceContext(invoiceId: string, client?: PoolClient): Promise<InvoicePaymentContext | null> {
    const { rows } = await runQuery<Record<string, unknown>>(
      `SELECT id, invoice_number, status, total_amount, paid_amount, due_date, is_locked, is_deleted
       FROM invoices WHERE id = $1`,
      [invoiceId],
      client,
    );
    const row = rows[0];
    if (!row || Boolean(row.is_deleted)) return null;

    return {
      id: String(row.id),
      invoiceNumber: String(row.invoice_number),
      status: Number(row.status),
      totalAmount: toNumber(row.total_amount as string),
      paidAmount: toNumber(row.paid_amount as string),
      dueDate: formatDate(row.due_date as Date | string)!,
      isLocked: Boolean(row.is_locked),
      isDeleted: Boolean(row.is_deleted),
    };
  }

  async sumPayments(invoiceId: string, client?: PoolClient): Promise<number> {
    const { rows } = await runQuery<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM invoice_payments
       WHERE invoice_id = $1 AND NOT is_deleted`,
      [invoiceId],
      client,
    );
    return toNumber(rows[0]?.total ?? '0');
  }

  async findByInvoiceId(invoiceId: string): Promise<InvoicePaymentDto[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT p.*, i.invoice_number, c.company_name AS client_name
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       INNER JOIN clients c ON c.id = i.client_id
       WHERE p.invoice_id = $1 AND NOT p.is_deleted
       ORDER BY p.payment_date DESC, p.created_at DESC`,
      [invoiceId],
    );
    return rows.map(mapPayment);
  }

  async findById(id: string, client?: PoolClient): Promise<InvoicePaymentDto | null> {
    const { rows } = await runQuery<Record<string, unknown>>(
      `SELECT p.*, i.invoice_number, c.company_name AS client_name
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       INNER JOIN clients c ON c.id = i.client_id
       WHERE p.id = $1 AND NOT p.is_deleted`,
      [id],
      client,
    );
    const row = rows[0];
    return row ? mapPayment(row) : null;
  }

  async findAll(filter: InvoicePaymentFilter): Promise<PaginatedResult<InvoicePaymentDto>> {
    const conditions = ['NOT p.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.invoiceId) {
      conditions.push(`p.invoice_id = $${i++}::uuid`);
      params.push(filter.invoiceId);
    }
    if (filter.clientId) {
      conditions.push(`i.client_id = $${i++}::uuid`);
      params.push(filter.clientId);
    }
    if (filter.paymentMode) {
      conditions.push(`p.payment_mode = $${i++}`);
      params.push(filter.paymentMode);
    }
    if (filter.fromDate) {
      conditions.push(`p.payment_date >= $${i++}`);
      params.push(filter.fromDate);
    }
    if (filter.toDate) {
      conditions.push(`p.payment_date <= $${i++}`);
      params.push(filter.toDate);
    }
    if (filter.search) {
      conditions.push(
        `(LOWER(i.invoice_number) LIKE $${i} OR LOWER(p.reference_number) LIKE $${i} OR LOWER(p.utr_number) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT p.*, i.invoice_number, c.company_name AS client_name
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       INNER JOIN clients c ON c.id = i.client_id
       WHERE ${where}
       ORDER BY p.payment_date DESC, p.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map(mapPayment),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async updatePayment(
    id: string,
    input: UpdateInvoicePaymentInput,
    client?: PoolClient,
  ): Promise<InvoicePaymentDto | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (input.paymentDate !== undefined) {
      sets.push(`payment_date = $${i++}`);
      params.push(input.paymentDate);
    }
    if (input.amount !== undefined) {
      sets.push(`amount = $${i++}`);
      params.push(input.amount);
    }
    if (input.referenceNumber !== undefined) {
      sets.push(`reference_number = $${i++}`);
      params.push(input.referenceNumber);
    }
    if (input.utrNumber !== undefined) {
      sets.push(`utr_number = $${i++}`);
      params.push(input.utrNumber);
    }
    if (input.paymentMode !== undefined) {
      sets.push(`payment_mode = $${i++}`);
      params.push(input.paymentMode);
    }
    if (input.remarks !== undefined) {
      sets.push(`remarks = $${i++}`);
      params.push(input.remarks);
    }

    if (!sets.length) return this.findById(id, client);

    sets.push(`updated_at = NOW()`, `updated_by = $${i++}`);
    params.push(input.updatedBy);
    params.push(id);

    const { rowCount } = await runQuery(
      `UPDATE invoice_payments SET ${sets.join(', ')}
       WHERE id = $${i} AND NOT is_deleted`,
      params,
      client,
    );

    if (!rowCount) return null;
    return this.findById(id, client);
  }

  async softDelete(id: string, deletedBy: string, client?: PoolClient): Promise<boolean> {
    const { rowCount } = await runQuery(
      `UPDATE invoice_payments
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
      client,
    );
    return (rowCount ?? 0) > 0;
  }

  async softDeleteByInvoiceId(
    invoiceId: string,
    deletedBy: string,
    client?: PoolClient,
  ): Promise<number> {
    const { rowCount } = await runQuery(
      `UPDATE invoice_payments
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2
       WHERE invoice_id = $1 AND NOT is_deleted`,
      [invoiceId, deletedBy],
      client,
    );
    return rowCount ?? 0;
  }

  async syncInvoicePaidAmount(
    invoiceId: string,
    paidAmount: number,
    status: number,
    updatedBy: string,
    client?: PoolClient,
  ): Promise<void> {
    await runQuery(
      `UPDATE invoices SET paid_amount = $2, status = $3, updated_at = NOW(), updated_by = $4
       WHERE id = $1 AND NOT is_deleted`,
      [invoiceId, round2(paidAmount), status, updatedBy],
      client,
    );
  }

  async logStatusEvent(
    invoiceId: string,
    fromStatus: number,
    toStatus: number,
    note: string,
    performedBy: string,
    client?: PoolClient,
  ): Promise<void> {
    await runQuery(
      `INSERT INTO invoice_status_events (invoice_id, from_status, to_status, note, performed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, fromStatus, toStatus, note, performedBy],
      client,
    );
  }

  async logAudit(
    invoiceId: string,
    action: string,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown>,
    createdBy: string,
    client?: PoolClient,
  ): Promise<void> {
    await runQuery(
      `INSERT INTO invoice_audit_logs (invoice_id, action, old_values, new_values, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, action, oldValues ? JSON.stringify(oldValues) : null, JSON.stringify(newValues), createdBy],
      client,
    );
  }

  async paymentCount(invoiceId: string, client?: PoolClient): Promise<number> {
    const { rows } = await runQuery<{ count: string }>(
      `SELECT COUNT(*) AS count FROM invoice_payments WHERE invoice_id = $1 AND NOT is_deleted`,
      [invoiceId],
      client,
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }
}

export const invoicePaymentRepository = new InvoicePaymentRepository();
