import { PoolClient } from 'pg';
import { withTransaction } from '../../database/pool';
import { InvoiceStatus } from '../../types/enums';
import { round2 } from '../../utils/formatters';
import { BillingEngineResult } from './billing-engine.types';
import { invoiceSeriesService } from './invoice-series.service';
import { billingEngineRepository } from './billing-engine.repository';

export interface CreateEngineInvoiceInput {
  engineResult: BillingEngineResult;
  createdBy: string;
  notes?: string | null;
  termsAndConditions?: string | null;
  invoiceDate?: string;
  dueDate?: string;
  invoiceDueDays?: number;
  configInvoicePrefix?: string | null;
}

export interface CreateEngineInvoiceResult {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: number;
  isLocked: boolean;
}

export class BillingInvoiceRepository {
  private componentIdCache = new Map<string, string>();

  private async getComponentId(code: string, client: PoolClient): Promise<string | null> {
    if (this.componentIdCache.has(code)) {
      return this.componentIdCache.get(code) ?? null;
    }

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM billing_components WHERE code = $1 AND NOT is_deleted`,
      [code],
    );

    const id = rows[0]?.id ?? null;
    if (id) this.componentIdCache.set(code, id);
    return id;
  }

  async createFromEngine(input: CreateEngineInvoiceInput): Promise<CreateEngineInvoiceResult> {
    const { engineResult: r } = input;
    const gstRate =
      r.tax.gstType === 'igst' ? r.tax.igstRate : round2(r.tax.cgstRate + r.tax.sgstRate);

    const invoiceDate = input.invoiceDate ?? new Date().toISOString().slice(0, 10);
    const dueDate =
      input.dueDate ??
      new Date(Date.now() + (input.invoiceDueDays ?? 30) * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    const companyState = await billingEngineRepository.getCompanyState();

    return withTransaction(async (client) => {
      const numbering = await invoiceSeriesService.allocateNumber(client, {
        clientId: r.clientId,
        siteId: r.siteId,
        month: r.month,
        year: r.year,
        configPrefix: input.configInvoicePrefix ?? null,
        createdBy: input.createdBy,
      });

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO invoices (
          invoice_number, client_id, site_id, invoice_date, due_date, month, year,
          sub_total, gst_rate, gst_amount, total_amount, paid_amount, status,
          notes, terms_and_conditions,
          contract_id, billing_configuration_id, attendance_register_id, payroll_run_id,
          invoice_series_id, invoice_type, financial_year_start, financial_year_end,
          place_of_supply, client_state, company_state, nature_of_service, sac_code,
          employee_charges, pf_contribution, esic_contribution, lwf_amount,
          service_charge_amount, taxable_value,
          cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
          is_locked, locked_at, locked_by, calculation_snapshot, created_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,
          $15,$16,$17,$18,$19,'standard',$20,$21,$22,$23,$24,$25,$26,
          $27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,
          TRUE,NOW(),$39,$40,$39
        ) RETURNING id`,
        [
          numbering.invoiceNumber,
          r.clientId,
          r.siteId,
          invoiceDate,
          dueDate,
          r.month,
          r.year,
          r.taxableValue,
          gstRate,
          r.tax.gstAmount,
          r.grandTotal,
          InvoiceStatus.Generated,
          input.notes ?? null,
          input.termsAndConditions ?? null,
          r.contractId,
          r.billingConfigurationId,
          r.attendanceRegisterId,
          r.payrollRunId,
          numbering.seriesId,
          numbering.fy.start,
          numbering.fy.end,
          r.placeOfSupply,
          r.placeOfSupply,
          companyState,
          r.natureOfService,
          r.sacCode,
          r.employeeCharges,
          r.pfContribution,
          r.esicContribution,
          r.lwfAmount,
          r.serviceChargeAmount,
          r.taxableValue,
          r.tax.cgstRate,
          r.tax.sgstRate,
          r.tax.igstRate,
          r.tax.cgstAmount,
          r.tax.sgstAmount,
          r.tax.igstAmount,
          input.createdBy,
          JSON.stringify(r.calculationSnapshot),
        ],
      );

      const invoiceId = rows[0].id;
      let sortOrder = 1;

      for (const line of r.components) {
        const componentId = await this.getComponentId(line.componentCode, client);
        const amount = round2(line.quantity * line.unitRate);

        await client.query(
          `INSERT INTO invoice_line_items (
            invoice_id, description, quantity, unit_rate, hsn_sac_code, sort_order,
            billing_component_id, component_code, amount, taxable_amount, is_taxable,
            designation_grade_id, department_id, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            invoiceId,
            line.description,
            line.quantity,
            line.unitRate,
            line.hsnSacCode,
            sortOrder++,
            componentId,
            line.componentCode,
            amount,
            line.isTaxable ? amount : 0,
            line.isTaxable,
            line.designationGradeId ?? null,
            line.departmentId ?? null,
            input.createdBy,
          ],
        );
      }

      if (r.tax.cgstAmount > 0) {
        await client.query(
          `INSERT INTO invoice_tax (invoice_id, tax_type, tax_rate, taxable_amount, tax_amount, created_by)
           VALUES ($1,'cgst',$2,$3,$4,$5)
           ON CONFLICT (invoice_id, tax_type) DO UPDATE SET
             tax_rate = EXCLUDED.tax_rate,
             taxable_amount = EXCLUDED.taxable_amount,
             tax_amount = EXCLUDED.tax_amount`,
          [invoiceId, r.tax.cgstRate, r.taxableValue, r.tax.cgstAmount, input.createdBy],
        );
      }

      if (r.tax.sgstAmount > 0) {
        await client.query(
          `INSERT INTO invoice_tax (invoice_id, tax_type, tax_rate, taxable_amount, tax_amount, created_by)
           VALUES ($1,'sgst',$2,$3,$4,$5)
           ON CONFLICT (invoice_id, tax_type) DO UPDATE SET
             tax_rate = EXCLUDED.tax_rate,
             taxable_amount = EXCLUDED.taxable_amount,
             tax_amount = EXCLUDED.tax_amount`,
          [invoiceId, r.tax.sgstRate, r.taxableValue, r.tax.sgstAmount, input.createdBy],
        );
      }

      if (r.tax.igstAmount > 0) {
        await client.query(
          `INSERT INTO invoice_tax (invoice_id, tax_type, tax_rate, taxable_amount, tax_amount, created_by)
           VALUES ($1,'igst',$2,$3,$4,$5)
           ON CONFLICT (invoice_id, tax_type) DO UPDATE SET
             tax_rate = EXCLUDED.tax_rate,
             taxable_amount = EXCLUDED.taxable_amount,
             tax_amount = EXCLUDED.tax_amount`,
          [invoiceId, r.tax.igstRate, r.taxableValue, r.tax.igstAmount, input.createdBy],
        );
      }

      await client.query(
        `INSERT INTO invoice_history (invoice_id, version_number, change_type, snapshot, change_summary, created_by)
         VALUES ($1, 1, 'generated', $2, 'Invoice generated by billing engine', $3)`,
        [invoiceId, JSON.stringify(r), input.createdBy],
      );

      await client.query(
        `INSERT INTO invoice_status_events (invoice_id, from_status, to_status, note, performed_by)
         VALUES ($1, NULL, $2, 'Invoice generated and locked', $3)`,
        [invoiceId, InvoiceStatus.Generated, input.createdBy],
      );

      await client.query(
        `INSERT INTO invoice_audit_logs (invoice_id, action, new_values, created_by)
         VALUES ($1, 'invoice_generated', $2, $3)`,
        [
          invoiceId,
          JSON.stringify({
            invoiceNumber: numbering.invoiceNumber,
            grandTotal: r.grandTotal,
            taxableValue: r.taxableValue,
            month: r.month,
            year: r.year,
          }),
          input.createdBy,
        ],
      );

      return {
        id: invoiceId,
        invoiceNumber: numbering.invoiceNumber,
        totalAmount: r.grandTotal,
        status: InvoiceStatus.Generated,
        isLocked: true,
      };
    });
  }
}

export const billingInvoiceRepository = new BillingInvoiceRepository();
