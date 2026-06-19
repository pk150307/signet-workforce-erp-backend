import { query } from '../../database/pool';
import {
  CreateSiteInvoiceInput,
  GenerateSiteInvoicesInput,
  GeneratedSiteInvoice,
  InvoiceDetailDto,
  InvoiceLineItemDto,
} from './billing.types';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { InvoiceStatus, EmployeeStatus } from '../../types/enums';
import { countWorkingDays, formatDate, round2, toNumber, monthName } from '../../utils/formatters';
import { AppError, NotFoundError } from '../../common/errors';

export class BillingRepository {
  async findById(id: string): Promise<InvoiceDetailDto | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT i.*, c.company_name, c.id AS client_id, s.site_name, s.site_code
       FROM invoices i
       INNER JOIN clients c ON c.id = i.client_id
       LEFT JOIN sites s ON s.id = i.site_id
       WHERE i.id = $1 AND NOT i.is_deleted`,
      [id],
    );

    const invoice = rows[0];
    if (!invoice) return null;

    const { rows: lineItems } = await query<Record<string, unknown>>(
      `SELECT id, description, quantity, unit_rate, hsn_sac_code
       FROM invoice_line_items WHERE invoice_id = $1 AND NOT is_deleted ORDER BY sort_order`,
      [id],
    );

    return this.mapInvoiceDetail(invoice, lineItems);
  }

  async findBySite(
    siteId: string,
    page: number,
    pageSize: number,
    month?: number,
    year?: number,
  ): Promise<PaginatedResult<InvoiceDetailDto>> {
    const conditions = ['NOT i.is_deleted', 'i.site_id = $1'];
    const params: unknown[] = [siteId];
    let i = 2;

    if (month) {
      conditions.push(`i.month = $${i++}`);
      params.push(month);
    }
    if (year) {
      conditions.push(`i.year = $${i++}`);
      params.push(year);
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM invoices i WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT i.*, c.company_name, c.id AS client_id, s.site_name, s.site_code
       FROM invoices i
       INNER JOIN clients c ON c.id = i.client_id
       LEFT JOIN sites s ON s.id = i.site_id
       WHERE ${where}
       ORDER BY i.invoice_date DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, pageSize, (page - 1) * pageSize],
    );

    const items: InvoiceDetailDto[] = [];
    for (const row of rows) {
      const { rows: lineItems } = await query<Record<string, unknown>>(
        `SELECT id, description, quantity, unit_rate, hsn_sac_code
         FROM invoice_line_items WHERE invoice_id = $1 AND NOT is_deleted ORDER BY sort_order`,
        [row.id],
      );
      items.push(this.mapInvoiceDetail(row, lineItems));
    }

    return createPaginatedResult(items, parseInt(count.rows[0].count, 10), page, pageSize);
  }

  async createInvoice(data: {
    clientId: string;
    siteId: string | null;
    invoiceDate: string;
    dueDate: string;
    month: number;
    year: number;
    gstRate: number;
    notes: string | null;
    termsAndConditions: string | null;
    lineItems: Array<{ description: string; quantity: number; unitRate: number; hsnSacCode?: string }>;
    createdBy: string;
  }): Promise<{ id: string; invoiceNumber: string; totalAmount: number }> {
    const countResult = await query<{ count: string }>('SELECT COUNT(*) AS count FROM invoices');
    const invoiceNumber = `INV-${data.year}${String(data.month).padStart(2, '0')}-${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(4, '0')}`;

    const subTotal = data.lineItems.reduce((sum, li) => sum + li.quantity * li.unitRate, 0);
    const gstAmount = round2(subTotal * (data.gstRate / 100));
    const totalAmount = round2(subTotal + gstAmount);

    const { rows } = await query<{ id: string }>(
      `INSERT INTO invoices (
        invoice_number, client_id, site_id, invoice_date, due_date, month, year,
        sub_total, gst_rate, gst_amount, total_amount, paid_amount, status,
        notes, terms_and_conditions, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15) RETURNING id`,
      [
        invoiceNumber,
        data.clientId,
        data.siteId,
        data.invoiceDate,
        data.dueDate,
        data.month,
        data.year,
        subTotal,
        data.gstRate,
        gstAmount,
        totalAmount,
        InvoiceStatus.Draft,
        data.notes,
        data.termsAndConditions,
        data.createdBy,
      ],
    );

    let sortOrder = 1;
    for (const item of data.lineItems) {
      await query(
        `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_rate, hsn_sac_code, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [rows[0].id, item.description, item.quantity, item.unitRate, item.hsnSacCode ?? null, sortOrder++, data.createdBy],
      );
    }

    return { id: rows[0].id, invoiceNumber, totalAmount };
  }

  async siteInvoiceExists(siteId: string, month: number, year: number): Promise<boolean> {
    const { rows } = await query(
      `SELECT 1 FROM invoices WHERE site_id = $1 AND month = $2 AND year = $3 AND NOT is_deleted`,
      [siteId, month, year],
    );
    return rows.length > 0;
  }

  async getSiteForBilling(siteId: string) {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT s.id, s.site_code, s.site_name, s.client_id, s.billing_rate_per_day,
              s.billing_rate_per_month, s.required_headcount, c.company_name
       FROM sites s INNER JOIN clients c ON c.id = s.client_id
       WHERE s.id = $1 AND NOT s.is_deleted AND s.is_active`,
      [siteId],
    );
    return rows[0] ?? null;
  }

  async getActiveSites(siteIds?: string[]) {
    let sql = `SELECT s.id, s.site_code, s.site_name, s.client_id, s.billing_rate_per_day,
                      s.billing_rate_per_month, s.required_headcount, c.company_name
               FROM sites s INNER JOIN clients c ON c.id = s.client_id
               WHERE NOT s.is_deleted AND s.is_active`;
    const params: unknown[] = [];
    if (siteIds?.length) {
      sql += ` AND s.id = ANY($1::uuid[])`;
      params.push(siteIds);
    }
    sql += ` ORDER BY s.site_name`;
    const { rows } = await query<Record<string, unknown>>(sql, params);
    return rows;
  }

  async countEmployeesAtSite(siteId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM employees
       WHERE site_id = $1 AND NOT is_deleted AND status = $2`,
      [siteId, EmployeeStatus.Active],
    );
    return parseInt(rows[0].count, 10);
  }

  private mapInvoiceDetail(invoice: Record<string, unknown>, lineItems: Record<string, unknown>[]): InvoiceDetailDto {
    const items: InvoiceLineItemDto[] = lineItems.map((li) => ({
      id: String(li.id),
      description: String(li.description),
      quantity: Number(li.quantity),
      unitRate: toNumber(li.unit_rate as string),
      amount: round2(Number(li.quantity) * toNumber(li.unit_rate as string)),
      hsnSacCode: li.hsn_sac_code ? String(li.hsn_sac_code) : null,
    }));

    const totalAmount = toNumber(invoice.total_amount as string);
    const paidAmount = toNumber(invoice.paid_amount as string);

    return {
      id: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number),
      clientId: String(invoice.client_id),
      clientName: String(invoice.company_name),
      siteId: invoice.site_id ? String(invoice.site_id) : null,
      siteName: invoice.site_name ? String(invoice.site_name) : null,
      siteCode: invoice.site_code ? String(invoice.site_code) : null,
      invoiceDate: formatDate(String(invoice.invoice_date))!,
      dueDate: formatDate(String(invoice.due_date))!,
      month: Number(invoice.month),
      year: Number(invoice.year),
      subTotal: toNumber(invoice.sub_total as string),
      gstRate: toNumber(invoice.gst_rate as string),
      gstAmount: toNumber(invoice.gst_amount as string),
      totalAmount,
      paidAmount,
      balanceAmount: round2(totalAmount - paidAmount),
      status: Number(invoice.status),
      notes: invoice.notes ? String(invoice.notes) : null,
      termsAndConditions: invoice.terms_and_conditions ? String(invoice.terms_and_conditions) : null,
      lineItems: items,
    };
  }
}

export class BillingService {
  private repo = new BillingRepository();

  async getInvoiceById(id: string) {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);
    return invoice;
  }

  getInvoicesBySite(siteId: string, page: number, pageSize: number, month?: number, year?: number) {
    return this.repo.findBySite(siteId, page, pageSize, month, year);
  }

  async createSiteInvoice(input: CreateSiteInvoiceInput) {
    const site = await this.repo.getSiteForBilling(input.siteId);
    if (!site) throw new NotFoundError('Site', input.siteId);

    if (await this.repo.siteInvoiceExists(input.siteId, input.month, input.year)) {
      throw new AppError(409, `Invoice already exists for site ${site.site_name} for ${input.month}/${input.year}.`);
    }

    const result = await this.repo.createInvoice({
      clientId: String(site.client_id),
      siteId: input.siteId,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      month: input.month,
      year: input.year,
      gstRate: input.gstRate,
      notes: input.notes ?? null,
      termsAndConditions: input.termsAndConditions ?? null,
      lineItems: input.lineItems,
      createdBy: input.createdBy,
    });

    return { ...result, siteId: input.siteId, siteName: String(site.site_name) };
  }

  async generateInvoicesBySites(input: GenerateSiteInvoicesInput): Promise<{
    generated: number;
    skipped: number;
    invoices: GeneratedSiteInvoice[];
  }> {
    const sites = await this.repo.getActiveSites(input.siteIds);
    const workingDays = countWorkingDays(input.year, input.month);
    const invoiceDate = new Date(input.year, input.month - 1, 1).toISOString().split('T')[0];
    const dueDate = new Date(input.year, input.month - 1, input.dueDateDays ?? 30).toISOString().split('T')[0];
    const gstRate = input.gstRate ?? 18;

    const invoices: GeneratedSiteInvoice[] = [];
    let skipped = 0;

    for (const site of sites) {
      const siteId = String(site.id);

      if (await this.repo.siteInvoiceExists(siteId, input.month, input.year)) {
        skipped++;
        continue;
      }

      const headcount = await this.repo.countEmployeesAtSite(siteId);
      const deployedCount = headcount > 0 ? headcount : Number(site.required_headcount) || 0;

      if (deployedCount === 0) {
        skipped++;
        continue;
      }

      const monthlyRate = toNumber(site.billing_rate_per_month as string | null);
      const dailyRate = toNumber(site.billing_rate_per_day as string | null);
      const unitRate = monthlyRate > 0 ? monthlyRate : dailyRate > 0 ? round2(dailyRate * workingDays) : 0;

      if (unitRate <= 0) {
        skipped++;
        continue;
      }

      const description = `Manpower services - ${site.site_name} - ${monthName(input.month, input.year)} (${deployedCount} personnel)`;

      const result = await this.repo.createInvoice({
        clientId: String(site.client_id),
        siteId,
        invoiceDate,
        dueDate,
        month: input.month,
        year: input.year,
        gstRate,
        notes: input.notes ?? `Auto-generated invoice for site ${site.site_code}`,
        termsAndConditions: 'Payment due within agreed credit period.',
        lineItems: [
          {
            description,
            quantity: deployedCount,
            unitRate,
            hsnSacCode: '998519',
          },
        ],
        createdBy: input.createdBy,
      });

      invoices.push({
        siteId,
        siteName: String(site.site_name),
        invoiceId: result.id,
        invoiceNumber: result.invoiceNumber,
        totalAmount: result.totalAmount,
      });
    }

    return { generated: invoices.length, skipped, invoices };
  }
}

export const billingService = new BillingService();
