import { AppError, ConflictError, NotFoundError } from '../../common/errors';
import { monthName } from '../../utils/formatters';
import { query } from '../../database/pool';
import { billingEngineService } from './billing-engine.service';
import { billingEngineRepository } from './billing-engine.repository';
import { billingInvoiceRepository } from './billing-invoice.repository';
import { GeneratedSiteInvoice } from './billing.types';

export interface GenerateInvoiceInput {
  month: number;
  year: number;
  clientId: string;
  siteId: string;
  notes?: string;
  termsAndConditions?: string;
  invoiceDate?: string;
  dueDate?: string;
  skipValidation?: boolean;
  createdBy: string;
}

export interface GenerateInvoiceResult extends GeneratedSiteInvoice {
  status: number;
  isLocked: boolean;
  taxableValue: number;
  gstAmount: number;
}

export class BillingInvoiceService {
  async generate(input: GenerateInvoiceInput): Promise<GenerateInvoiceResult> {
    const siteRow = await billingEngineRepository.getClientSiteContext(input.clientId, input.siteId);
    if (!siteRow) throw new NotFoundError('Site', input.siteId);

    const exists = await billingEngineRepository.siteInvoiceExists(
      input.siteId,
      input.month,
      input.year,
    );
    if (exists) {
      throw new ConflictError(
        `Invoice already exists for this site for ${input.month}/${input.year}.`,
      );
    }

    const engineResult = await billingEngineService.calculate({
      month: input.month,
      year: input.year,
      clientId: input.clientId,
      siteId: input.siteId,
      skipValidation: input.skipValidation ?? false,
    });

    if (engineResult.components.length === 0) {
      throw new AppError(400, 'No billable data found for the selected client, site, and period.');
    }

    const config = await billingEngineRepository.getBillingConfiguration(input.siteId);

    const created = await billingInvoiceRepository.createFromEngine({
      engineResult,
      createdBy: input.createdBy,
      notes:
        input.notes ??
        (config?.invoice_notes ? String(config.invoice_notes) : null) ??
        `Auto-generated invoice for ${String(siteRow.site_name)} (${monthName(input.month, input.year)})`,
      termsAndConditions:
        input.termsAndConditions ??
        'Payment due within agreed credit period. Amounts are calculated from attendance, payroll, and contract terms.',
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      invoiceDueDays: config?.invoice_due_days != null ? Number(config.invoice_due_days) : 30,
      configInvoicePrefix: config?.invoice_prefix ? String(config.invoice_prefix) : null,
    });

    return {
      siteId: input.siteId,
      siteName: String(siteRow.site_name),
      invoiceId: created.id,
      invoiceNumber: created.invoiceNumber,
      totalAmount: created.totalAmount,
      status: created.status,
      isLocked: created.isLocked,
      taxableValue: engineResult.taxableValue,
      gstAmount: engineResult.tax.gstAmount,
    };
  }

  async generateForSite(input: {
    siteId: string;
    month: number;
    year: number;
    notes?: string;
    skipValidation?: boolean;
    createdBy: string;
  }): Promise<GenerateInvoiceResult> {
    const { rows } = await query<{ client_id: string; site_name: string }>(
      `SELECT client_id, site_name FROM sites WHERE id = $1 AND NOT is_deleted`,
      [input.siteId],
    );
    const site = rows[0];
    if (!site) throw new NotFoundError('Site', input.siteId);

    return this.generate({
      month: input.month,
      year: input.year,
      clientId: String(site.client_id),
      siteId: input.siteId,
      notes: input.notes,
      skipValidation: input.skipValidation,
      createdBy: input.createdBy,
    });
  }
}

export const billingInvoiceService = new BillingInvoiceService();
