import { query } from '../../database/pool';
import { InvoiceStatus } from '../../types/enums';
import { formatDate, round2, toNumber } from '../../utils/formatters';
import {
  BillingCollectionsFilter,
  BillingGstFilter,
  BillingOutstandingFilter,
  BillingPeriodSummaryDto,
  BillingReportFilter,
  CollectionPaymentRow,
  CollectionsReportDto,
  GstClientBreakdown,
  GstReportDto,
  OutstandingInvoiceRow,
  OutstandingReportDto,
} from './billing-reports.types';

const EXCLUDED_STATUSES = [
  InvoiceStatus.Draft,
  InvoiceStatus.Cancelled,
  InvoiceStatus.Archived,
];

function buildInvoiceConditions(
  filter: BillingReportFilter,
  alias = 'i',
): { where: string; params: unknown[] } {
  const conditions = [`NOT ${alias}.is_deleted`, `${alias}.status NOT IN (${EXCLUDED_STATUSES.join(',')})`];
  const params: unknown[] = [];
  let idx = 1;

  if (filter.month) {
    conditions.push(`${alias}.month = $${idx++}`);
    params.push(filter.month);
  }
  if (filter.year) {
    conditions.push(`${alias}.year = $${idx++}`);
    params.push(filter.year);
  }
  if (filter.clientId) {
    conditions.push(`${alias}.client_id = $${idx++}::uuid`);
    params.push(filter.clientId);
  }
  if (filter.siteId) {
    conditions.push(`${alias}.site_id = $${idx++}::uuid`);
    params.push(filter.siteId);
  }
  if (filter.fromDate) {
    conditions.push(`${alias}.invoice_date >= $${idx++}`);
    params.push(filter.fromDate);
  }
  if (filter.toDate) {
    conditions.push(`${alias}.invoice_date <= $${idx++}`);
    params.push(filter.toDate);
  }

  return { where: conditions.join(' AND '), params };
}

function agingBucket(daysOverdue: number): OutstandingInvoiceRow['agingBucket'] {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

function daysBetween(asOfDate: string, dueDate: string): number {
  const asOf = new Date(`${asOfDate}T00:00:00Z`).getTime();
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.floor((asOf - due) / (24 * 60 * 60 * 1000));
}

export class BillingReportsRepository {
  async getPeriodSummary(filter: BillingReportFilter): Promise<BillingPeriodSummaryDto> {
    const month = filter.month ?? new Date().getMonth() + 1;
    const year = filter.year ?? new Date().getFullYear();
    const { where, params } = buildInvoiceConditions({ ...filter, month, year });

    const { rows } = await query<Record<string, unknown>>(
      `SELECT
         COUNT(*) AS invoice_count,
         COALESCE(SUM(total_amount), 0) AS total_billed,
         COALESCE(SUM(paid_amount), 0) AS total_collected,
         COALESCE(SUM(taxable_value), 0) AS taxable_value,
         COALESCE(SUM(gst_amount), 0) AS total_gst,
         COALESCE(SUM(cgst_amount), 0) AS cgst_amount,
         COALESCE(SUM(sgst_amount), 0) AS sgst_amount,
         COALESCE(SUM(igst_amount), 0) AS igst_amount,
         COUNT(*) FILTER (WHERE status = $${params.length + 1}) AS overdue_count,
         COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status = $${params.length + 1}), 0) AS overdue_amount
       FROM invoices i
       WHERE ${where}`,
      [...params, InvoiceStatus.Overdue],
    );

    const row = rows[0];
    const totalBilled = toNumber(row.total_billed as string);
    const totalCollected = toNumber(row.total_collected as string);

    return {
      month,
      year,
      invoiceCount: parseInt(String(row.invoice_count), 10),
      totalBilled,
      totalCollected,
      outstanding: round2(totalBilled - totalCollected),
      overdueCount: parseInt(String(row.overdue_count), 10),
      overdueAmount: toNumber(row.overdue_amount as string),
      collectionRate: totalBilled > 0 ? round2((totalCollected / totalBilled) * 100) : 0,
      taxableValue: toNumber(row.taxable_value as string),
      totalGst: toNumber(row.total_gst as string),
      cgstAmount: toNumber(row.cgst_amount as string),
      sgstAmount: toNumber(row.sgst_amount as string),
      igstAmount: toNumber(row.igst_amount as string),
    };
  }

  async getOutstandingReport(filter: BillingOutstandingFilter): Promise<OutstandingReportDto> {
    const asOfDate = filter.asOfDate ?? new Date().toISOString().slice(0, 10);
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;

    const conditions = [
      'NOT i.is_deleted',
      `i.status NOT IN (${EXCLUDED_STATUSES.join(',')})`,
      'i.total_amount > i.paid_amount',
    ];
    const params: unknown[] = [];
    let idx = 1;

    if (filter.clientId) {
      conditions.push(`i.client_id = $${idx++}::uuid`);
      params.push(filter.clientId);
    }
    if (filter.siteId) {
      conditions.push(`i.site_id = $${idx++}::uuid`);
      params.push(filter.siteId);
    }
    if (filter.month) {
      conditions.push(`i.month = $${idx++}`);
      params.push(filter.month);
    }
    if (filter.year) {
      conditions.push(`i.year = $${idx++}`);
      params.push(filter.year);
    }

    const where = conditions.join(' AND ');

    const { rows: allRows } = await query<Record<string, unknown>>(
      `SELECT i.id, i.invoice_number, i.client_id, c.company_name AS client_name,
              i.site_id, s.site_name, i.invoice_date, i.due_date,
              i.total_amount, i.paid_amount, i.status
       FROM invoices i
       INNER JOIN clients c ON c.id = i.client_id
       LEFT JOIN sites s ON s.id = i.site_id
       WHERE ${where}
       ORDER BY i.due_date ASC, i.invoice_date ASC`,
      params,
    );

    const items: OutstandingInvoiceRow[] = allRows.map((row) => {
      const totalAmount = toNumber(row.total_amount as string);
      const paidAmount = toNumber(row.paid_amount as string);
      const dueDate = formatDate(row.due_date as Date | string)!;
      const daysOverdue = daysBetween(asOfDate, dueDate);

      return {
        id: String(row.id),
        invoiceNumber: String(row.invoice_number),
        clientId: String(row.client_id),
        clientName: String(row.client_name),
        siteId: row.site_id ? String(row.site_id) : null,
        siteName: row.site_name ? String(row.site_name) : null,
        invoiceDate: formatDate(row.invoice_date as Date | string)!,
        dueDate,
        totalAmount,
        paidAmount,
        balanceAmount: round2(totalAmount - paidAmount),
        daysOverdue: Math.max(0, daysOverdue),
        agingBucket: agingBucket(daysOverdue),
        status: Number(row.status),
      };
    });

    const summary = {
      invoiceCount: items.length,
      totalOutstanding: round2(items.reduce((sum, row) => sum + row.balanceAmount, 0)),
      current: 0,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      days90Plus: 0,
    };

    for (const item of items) {
      switch (item.agingBucket) {
        case 'current':
          summary.current = round2(summary.current + item.balanceAmount);
          break;
        case '1-30':
          summary.days1To30 = round2(summary.days1To30 + item.balanceAmount);
          break;
        case '31-60':
          summary.days31To60 = round2(summary.days31To60 + item.balanceAmount);
          break;
        case '61-90':
          summary.days61To90 = round2(summary.days61To90 + item.balanceAmount);
          break;
        case '90+':
          summary.days90Plus = round2(summary.days90Plus + item.balanceAmount);
          break;
      }
    }

    const offset = (page - 1) * pageSize;
    const pagedItems = items.slice(offset, offset + pageSize);

    return {
      asOfDate,
      summary,
      items: pagedItems,
      total: items.length,
      page,
      pageSize,
    };
  }

  async getCollectionsReport(filter: BillingCollectionsFilter): Promise<CollectionsReportDto> {
    const now = new Date();
    const month = filter.month ?? now.getMonth() + 1;
    const year = filter.year ?? now.getFullYear();
    const fromDate =
      filter.fromDate ?? `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate =
      filter.toDate ?? `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;

    const conditions = ['NOT p.is_deleted', 'NOT i.is_deleted'];
    const params: unknown[] = [fromDate, toDate];
    let idx = 3;

    conditions.push(`p.payment_date BETWEEN $1 AND $2`);

    if (filter.clientId) {
      conditions.push(`i.client_id = $${idx++}::uuid`);
      params.push(filter.clientId);
    }
    if (filter.siteId) {
      conditions.push(`i.site_id = $${idx++}::uuid`);
      params.push(filter.siteId);
    }
    if (filter.paymentMode) {
      conditions.push(`p.payment_mode = $${idx++}`);
      params.push(filter.paymentMode);
    }

    const where = conditions.join(' AND ');

    const { rows: allRows } = await query<Record<string, unknown>>(
      `SELECT p.id, p.payment_date, p.amount, p.payment_mode, p.reference_number, p.utr_number,
              i.id AS invoice_id, i.invoice_number, i.client_id, c.company_name AS client_name
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       INNER JOIN clients c ON c.id = i.client_id
       WHERE ${where}
       ORDER BY p.payment_date DESC, p.created_at DESC`,
      params,
    );

    const items: CollectionPaymentRow[] = allRows.map((row) => ({
      id: String(row.id),
      paymentDate: formatDate(row.payment_date as Date | string)!,
      amount: toNumber(row.amount as string),
      paymentMode: String(row.payment_mode),
      referenceNumber: row.reference_number ? String(row.reference_number) : null,
      utrNumber: row.utr_number ? String(row.utr_number) : null,
      invoiceId: String(row.invoice_id),
      invoiceNumber: String(row.invoice_number),
      clientId: String(row.client_id),
      clientName: String(row.client_name),
    }));

    const modeMap = new Map<string, { count: number; amount: number }>();
    const clientMap = new Map<string, { clientName: string; count: number; amount: number }>();

    for (const item of items) {
      const mode = modeMap.get(item.paymentMode) ?? { count: 0, amount: 0 };
      mode.count += 1;
      mode.amount = round2(mode.amount + item.amount);
      modeMap.set(item.paymentMode, mode);

      const client = clientMap.get(item.clientId) ?? {
        clientName: item.clientName,
        count: 0,
        amount: 0,
      };
      client.count += 1;
      client.amount = round2(client.amount + item.amount);
      clientMap.set(item.clientId, client);
    }

    const offset = (page - 1) * pageSize;

    return {
      fromDate,
      toDate,
      summary: {
        paymentCount: items.length,
        totalCollected: round2(items.reduce((sum, row) => sum + row.amount, 0)),
        byMode: [...modeMap.entries()]
          .map(([paymentMode, data]) => ({ paymentMode, ...data }))
          .sort((a, b) => b.amount - a.amount),
        byClient: [...clientMap.entries()]
          .map(([clientId, data]) => ({
            clientId,
            clientName: data.clientName,
            count: data.count,
            amount: data.amount,
          }))
          .sort((a, b) => b.amount - a.amount),
      },
      items: items.slice(offset, offset + pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }

  async getGstReport(filter: BillingGstFilter): Promise<GstReportDto> {
    const { where, params } = buildInvoiceConditions(filter);

    const { rows: summaryRows } = await query<Record<string, unknown>>(
      `SELECT
         COUNT(*) AS invoice_count,
         COALESCE(SUM(taxable_value), 0) AS taxable_value,
         COALESCE(SUM(cgst_amount), 0) AS cgst_amount,
         COALESCE(SUM(sgst_amount), 0) AS sgst_amount,
         COALESCE(SUM(igst_amount), 0) AS igst_amount,
         COALESCE(SUM(gst_amount), 0) AS total_gst,
         COALESCE(SUM(total_amount), 0) AS grand_total,
         COUNT(*) FILTER (WHERE igst_amount > 0) AS igst_invoice_count,
         COUNT(*) FILTER (WHERE cgst_amount > 0 OR sgst_amount > 0) AS cgst_sgst_invoice_count
       FROM invoices i
       WHERE ${where}`,
      params,
    );

    const summaryRow = summaryRows[0];

    const { rows: clientRows } = await query<Record<string, unknown>>(
      `SELECT i.client_id, c.company_name AS client_name,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(i.taxable_value), 0) AS taxable_value,
              COALESCE(SUM(i.cgst_amount), 0) AS cgst_amount,
              COALESCE(SUM(i.sgst_amount), 0) AS sgst_amount,
              COALESCE(SUM(i.igst_amount), 0) AS igst_amount,
              COALESCE(SUM(i.gst_amount), 0) AS total_gst,
              COALESCE(SUM(i.total_amount), 0) AS grand_total
       FROM invoices i
       INNER JOIN clients c ON c.id = i.client_id
       WHERE ${where}
       GROUP BY i.client_id, c.company_name
       ORDER BY grand_total DESC`,
      params,
    );

    const byClient: GstClientBreakdown[] = clientRows.map((row) => ({
      clientId: String(row.client_id),
      clientName: String(row.client_name),
      invoiceCount: parseInt(String(row.invoice_count), 10),
      taxableValue: toNumber(row.taxable_value as string),
      cgstAmount: toNumber(row.cgst_amount as string),
      sgstAmount: toNumber(row.sgst_amount as string),
      igstAmount: toNumber(row.igst_amount as string),
      totalGst: toNumber(row.total_gst as string),
      grandTotal: toNumber(row.grand_total as string),
    }));

    return {
      period: {
        month: filter.month,
        year: filter.year,
        fromDate: filter.fromDate,
        toDate: filter.toDate,
      },
      summary: {
        invoiceCount: parseInt(String(summaryRow.invoice_count), 10),
        taxableValue: toNumber(summaryRow.taxable_value as string),
        cgstAmount: toNumber(summaryRow.cgst_amount as string),
        sgstAmount: toNumber(summaryRow.sgst_amount as string),
        igstAmount: toNumber(summaryRow.igst_amount as string),
        totalGst: toNumber(summaryRow.total_gst as string),
        grandTotal: toNumber(summaryRow.grand_total as string),
        igstInvoiceCount: parseInt(String(summaryRow.igst_invoice_count), 10),
        cgstSgstInvoiceCount: parseInt(String(summaryRow.cgst_sgst_invoice_count), 10),
      },
      byClient,
    };
  }
}

export const billingReportsRepository = new BillingReportsRepository();
