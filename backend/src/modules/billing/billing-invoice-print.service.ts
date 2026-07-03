import { query } from '../../database/pool';
import { InvoiceStatus } from '../../types/enums';
import { amountInWords } from '../../utils/amount-in-words';
import { formatDate, round2, toNumber } from '../../utils/formatters';
import { NotFoundError } from '../../common/errors';
import { resolveFileUrl } from '../documents/upload.config';
import { InvoicePrintDto, InvoiceTaxLineDto } from './billing.types';

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

export class BillingInvoicePrintService {
  async getInvoiceForPrint(id: string): Promise<InvoicePrintDto> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT i.*,
              c.company_name, c.address AS client_address, c.city AS client_city,
              c.state AS client_state, c.pin_code AS client_pin_code,
              c.gst_number AS client_gst_number, c.pan_number AS client_pan_number,
              s.site_name, s.site_code
       FROM invoices i
       INNER JOIN clients c ON c.id = i.client_id
       LEFT JOIN sites s ON s.id = i.site_id
       WHERE i.id = $1 AND NOT i.is_deleted`,
      [id],
    );

    const invoice = rows[0];
    if (!invoice) throw new NotFoundError('Invoice', id);

    const { rows: lineItems } = await query<Record<string, unknown>>(
      `SELECT id, description, quantity, unit_rate, amount, hsn_sac_code, component_code
       FROM invoice_line_items
       WHERE invoice_id = $1 AND NOT is_deleted
       ORDER BY sort_order`,
      [id],
    );

    const { rows: taxRows } = await query<Record<string, unknown>>(
      `SELECT tax_type, tax_rate, taxable_amount, tax_amount
       FROM invoice_tax WHERE invoice_id = $1`,
      [id],
    );

    const company = await this.getCompanyForPrint();

    const cgstAmount = toNumber(invoice.cgst_amount as string);
    const sgstAmount = toNumber(invoice.sgst_amount as string);
    const igstAmount = toNumber(invoice.igst_amount as string);
    const gstType: 'cgst_sgst' | 'igst' = igstAmount > 0 ? 'igst' : 'cgst_sgst';

    const taxableValue = toNumber(invoice.taxable_value as string) || toNumber(invoice.sub_total as string);
    const totalAmount = Math.round(toNumber(invoice.total_amount as string));
    const paidAmount = toNumber(invoice.paid_amount as string);

    const clientAddressParts = [
      invoice.client_address ? String(invoice.client_address) : '',
      [invoice.client_city, invoice.client_state, invoice.client_pin_code]
        .filter(Boolean)
        .map(String)
        .join(', '),
    ].filter(Boolean);

    const taxLines: InvoiceTaxLineDto[] = taxRows.map((row) => ({
      taxType: String(row.tax_type) as InvoiceTaxLineDto['taxType'],
      taxRate: toNumber(row.tax_rate as string),
      taxableAmount: toNumber(row.taxable_amount as string),
      taxAmount: toNumber(row.tax_amount as string),
    }));

    if (taxLines.length === 0) {
      if (cgstAmount > 0) {
        taxLines.push({
          taxType: 'cgst',
          taxRate: toNumber(invoice.cgst_rate as string),
          taxableAmount: taxableValue,
          taxAmount: cgstAmount,
        });
      }
      if (sgstAmount > 0) {
        taxLines.push({
          taxType: 'sgst',
          taxRate: toNumber(invoice.sgst_rate as string),
          taxableAmount: taxableValue,
          taxAmount: sgstAmount,
        });
      }
      if (igstAmount > 0) {
        taxLines.push({
          taxType: 'igst',
          taxRate: toNumber(invoice.igst_rate as string),
          taxableAmount: taxableValue,
          taxAmount: igstAmount,
        });
      }
    }

    const status = Number(invoice.status);
    const sacCode = invoice.sac_code ? String(invoice.sac_code) : '998519';

    return {
      id: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number),
      invoiceDate: formatDate(invoice.invoice_date as Date | string)!,
      dueDate: formatDate(invoice.due_date as Date | string)!,
      month: Number(invoice.month),
      year: Number(invoice.year),
      status,
      statusLabel: STATUS_LABELS[status] ?? 'Unknown',
      isLocked: Boolean(invoice.is_locked),
      clientId: String(invoice.client_id),
      clientName: String(invoice.company_name),
      clientGstNumber: invoice.client_gst_number ? String(invoice.client_gst_number) : null,
      clientPanNumber: invoice.client_pan_number ? String(invoice.client_pan_number) : null,
      clientAddress: clientAddressParts.length ? clientAddressParts.join('\n') : null,
      clientCity: invoice.client_city ? String(invoice.client_city) : null,
      clientState: invoice.client_state ? String(invoice.client_state) : null,
      placeOfSupply: invoice.place_of_supply
        ? String(invoice.place_of_supply)
        : invoice.client_state
          ? String(invoice.client_state)
          : null,
      siteId: invoice.site_id ? String(invoice.site_id) : null,
      siteName: invoice.site_name ? String(invoice.site_name) : null,
      siteCode: invoice.site_code ? String(invoice.site_code) : null,
      natureOfService: invoice.nature_of_service
        ? String(invoice.nature_of_service)
        : 'Manpower Supply Services',
      sacCode,
      lineItems: lineItems.map((li) => ({
        id: String(li.id),
        description: String(li.description),
        quantity: Number(li.quantity),
        unitRate: toNumber(li.unit_rate as string),
        amount: li.amount != null ? toNumber(li.amount as string) : round2(Number(li.quantity) * toNumber(li.unit_rate as string)),
        hsnSacCode: li.hsn_sac_code ? String(li.hsn_sac_code) : sacCode,
        componentCode: li.component_code ? String(li.component_code) : null,
      })),
      employeeCharges: toNumber(invoice.employee_charges as string),
      pfContribution: toNumber(invoice.pf_contribution as string),
      esicContribution: toNumber(invoice.esic_contribution as string),
      lwfAmount: toNumber(invoice.lwf_amount as string),
      serviceChargeAmount: toNumber(invoice.service_charge_amount as string),
      taxableValue,
      subTotal: toNumber(invoice.sub_total as string),
      gstRate: toNumber(invoice.gst_rate as string),
      gstAmount: toNumber(invoice.gst_amount as string),
      cgstRate: toNumber(invoice.cgst_rate as string),
      sgstRate: toNumber(invoice.sgst_rate as string),
      igstRate: toNumber(invoice.igst_rate as string),
      cgstAmount,
      sgstAmount,
      igstAmount,
      gstType,
      totalAmount,
      paidAmount,
      balanceAmount: round2(totalAmount - paidAmount),
      amountInWords: amountInWords(totalAmount),
      notes: invoice.notes ? String(invoice.notes) : null,
      termsAndConditions: invoice.terms_and_conditions ? String(invoice.terms_and_conditions) : null,
      taxLines,
      company,
      qrPayload: this.buildQrPayload(String(invoice.invoice_number), totalAmount, company?.gstNumber ?? null),
    };
  }

  private buildQrPayload(invoiceNumber: string, totalAmount: number, supplierGstin: string | null): string {
    return JSON.stringify({
      version: '1.0',
      inv: invoiceNumber,
      amt: totalAmount,
      gstin: supplierGstin,
    });
  }

  private async getCompanyForPrint() {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT company_name, legal_name, gst_number, pan_number, email, phone,
              address, city, state, pin_code, billing_address, billing_city,
              billing_state, billing_pin_code, logo_url,
              pf_establishment_code, esic_code, bank_name, bank_account_number,
              bank_ifsc, bank_branch
       FROM company_profiles WHERE NOT is_deleted ORDER BY created_at LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return null;

    const logoPath = row.logo_url ? String(row.logo_url) : null;
    const address = row.billing_address ? String(row.billing_address) : String(row.address);

    return {
      companyName: String(row.company_name),
      legalName: row.legal_name ? String(row.legal_name) : null,
      address,
      city: row.billing_city ? String(row.billing_city) : String(row.city),
      state: row.billing_state ? String(row.billing_state) : String(row.state),
      pinCode: row.billing_pin_code ? String(row.billing_pin_code) : row.pin_code ? String(row.pin_code) : null,
      gstNumber: row.gst_number ? String(row.gst_number) : null,
      panNumber: row.pan_number ? String(row.pan_number) : null,
      email: row.email ? String(row.email) : null,
      phone: row.phone ? String(row.phone) : null,
      logoUrl: logoPath ? resolveFileUrl(logoPath) || null : null,
      pfEstablishmentCode: row.pf_establishment_code ? String(row.pf_establishment_code) : null,
      esicCode: row.esic_code ? String(row.esic_code) : null,
      bankName: row.bank_name ? String(row.bank_name) : null,
      bankAccountNumber: row.bank_account_number ? String(row.bank_account_number) : null,
      bankIfsc: row.bank_ifsc ? String(row.bank_ifsc) : null,
      bankBranch: row.bank_branch ? String(row.bank_branch) : null,
    };
  }
}

export const billingInvoicePrintService = new BillingInvoicePrintService();
