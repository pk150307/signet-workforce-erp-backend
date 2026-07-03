import { query } from '../../database/pool';
import { PayrollStatus } from '../../types/enums';
import { BILLING_STATUTORY_DEFAULTS } from './billing.constants';
import { BillingEngineContext } from './billing-engine.types';

export interface ClientGradeRate {
  designationGradeId: string;
  ratePerDay: number | null;
  ratePerMonth: number | null;
  siteId: string | null;
}

export class BillingEngineRepository {
  async getCompanyState(): Promise<string | null> {
    const { rows } = await query<{ state: string; billing_state: string | null }>(
      `SELECT state, billing_state FROM company_profiles WHERE NOT is_deleted LIMIT 1`,
    );
    const row = rows[0];
    return row?.billing_state ?? row?.state ?? null;
  }

  async getClientSiteContext(clientId: string, siteId: string) {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT c.id AS client_id, c.company_name, c.state AS client_state, c.gst_number,
              s.id AS site_id, s.site_name, s.state AS site_state,
              s.billing_rate_per_day, s.billing_rate_per_month, s.required_headcount
       FROM clients c
       INNER JOIN sites s ON s.client_id = c.id AND s.id = $2
       WHERE c.id = $1 AND NOT c.is_deleted AND NOT s.is_deleted`,
      [clientId, siteId],
    );
    return rows[0] ?? null;
  }

  async getBillingConfiguration(siteId: string) {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT bc.*,
              ct.id AS contract_id, ct.status AS contract_status,
              ct.start_date AS contract_start_date, ct.end_date AS contract_end_date
       FROM billing_configurations bc
       LEFT JOIN contracts ct ON ct.id = bc.contract_id AND NOT ct.is_deleted
       WHERE bc.site_id = $1 AND NOT bc.is_deleted AND bc.is_active`,
      [siteId],
    );
    return rows[0] ?? null;
  }

  async getActiveContract(clientId: string, siteId: string, month: number, year: number) {
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEndDate = new Date(year, month, 0);
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(periodEndDate.getDate()).padStart(2, '0')}`;

    const { rows } = await query<Record<string, unknown>>(
      `SELECT *
       FROM contracts
       WHERE client_id = $1
         AND (site_id = $2 OR site_id IS NULL)
         AND status = 'active'
         AND start_date <= $4::date
         AND (end_date IS NULL OR end_date >= $3::date)
         AND NOT is_deleted
       ORDER BY CASE WHEN site_id = $2 THEN 0 ELSE 1 END, start_date DESC
       LIMIT 1`,
      [clientId, siteId, periodStart, periodEnd],
    );
    return rows[0] ?? null;
  }

  async getAttendanceRegister(clientId: string, month: number, year: number) {
    const { rows } = await query<{ id: string; status: string }>(
      `SELECT id, status FROM attendance_registers
       WHERE client_id = $1 AND month = $2 AND year = $3`,
      [clientId, month, year],
    );
    return rows[0] ?? null;
  }

  async getPayrollRun(month: number, year: number) {
    const { rows } = await query<{ id: string; status: number }>(
      `SELECT id, status FROM payroll_runs
       WHERE month = $1 AND year = $2 AND NOT is_deleted
       ORDER BY created_at DESC LIMIT 1`,
      [month, year],
    );
    return rows[0] ?? null;
  }

  isPayrollProcessed(status: number): boolean {
    return status >= PayrollStatus.Processing;
  }

  isAttendanceProcessed(status: string): boolean {
    return status === 'locked' || status === 'submitted';
  }

  async getEnabledComponents(billingConfigurationId: string) {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT comp.code, comp.name, bcc.is_enabled, comp.is_taxable, comp.hsn_sac_code,
              bcc.pct_override, bcc.rate_override
       FROM billing_configuration_components bcc
       INNER JOIN billing_components comp ON comp.id = bcc.billing_component_id AND NOT comp.is_deleted
       WHERE bcc.billing_configuration_id = $1
       ORDER BY bcc.sort_order, comp.sort_order`,
      [billingConfigurationId],
    );
    return rows;
  }

  async getClientGradeRates(clientId: string, siteId: string): Promise<ClientGradeRate[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT designation_grade_id, rate_per_day, rate_per_month, site_id
       FROM client_designation_grade_rates
       WHERE client_id = $1 AND (site_id IS NULL OR site_id = $2)
       ORDER BY CASE WHEN site_id = $2 THEN 0 ELSE 1 END`,
      [clientId, siteId],
    );

    const map = new Map<string, ClientGradeRate>();
    for (const row of rows) {
      const gradeId = String(row.designation_grade_id);
      if (map.has(gradeId)) continue;
      map.set(gradeId, {
        designationGradeId: gradeId,
        ratePerDay: row.rate_per_day != null ? Number(row.rate_per_day) : null,
        ratePerMonth: row.rate_per_month != null ? Number(row.rate_per_month) : null,
        siteId: row.site_id ? String(row.site_id) : null,
      });
    }
    return [...map.values()];
  }

  async sumPayrollLwfForSite(siteId: string, payrollRunId: string): Promise<number> {
    const { rows } = await query<{ total: string }>(
      `SELECT COALESCE(SUM(pe.lwf), 0)::text AS total
       FROM payroll_entries pe
       INNER JOIN employees e ON e.id = pe.employee_id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       WHERE pe.payroll_run_id = $1
         AND COALESCE(ed.site_id, e.site_id) = $2
         AND NOT pe.is_deleted`,
      [payrollRunId, siteId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Authoritative billing figures sourced from the processed payroll run so the
   * invoice matches the payslips exactly (instead of re-deriving from attendance):
   * - basicEarned : sum of earned basic           => EPF base
   * - grossEarnings : sum of earned gross         => Manpower Arrangement Charges
   * - netEarnings : sum of take-home net salary
   * - employeeLwf : sum of employee LWF deductions => LWF cap (2 x employee LWF)
   */
  async getPayrollBillingAggregateForSite(
    siteId: string,
    payrollRunId: string,
  ): Promise<{
    basicEarned: number;
    grossEarnings: number;
    netEarnings: number;
    employeeLwf: number;
    entryCount: number;
  }> {
    const { rows } = await query<{
      basic_earned: string;
      gross_earnings: string;
      net_earnings: string;
      employee_lwf: string;
      entry_count: string;
    }>(
      `SELECT
         COALESCE(SUM(pe.basic_salary), 0)::text AS basic_earned,
         COALESCE(SUM(
           pe.basic_salary + pe.house_rent_allowance + pe.special_allowance
           + pe.overtime_pay + pe.night_allowance + pe.punctuality_award
         ), 0)::text AS gross_earnings,
         COALESCE(SUM(
           pe.basic_salary + pe.house_rent_allowance + pe.special_allowance
           + pe.overtime_pay + pe.night_allowance + pe.punctuality_award
           - pe.provident_fund - pe.esi - pe.professional_tax - pe.lwf
         ), 0)::text AS net_earnings,
         COALESCE(SUM(pe.lwf), 0)::text AS employee_lwf,
         COUNT(*)::text AS entry_count
       FROM payroll_entries pe
       INNER JOIN employees e ON e.id = pe.employee_id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       WHERE pe.payroll_run_id = $1
         AND COALESCE(ed.site_id, e.site_id) = $2
         AND NOT pe.is_deleted`,
      [payrollRunId, siteId],
    );
    const r = rows[0];
    return {
      basicEarned: Number(r?.basic_earned ?? 0),
      grossEarnings: Number(r?.gross_earnings ?? 0),
      netEarnings: Number(r?.net_earnings ?? 0),
      employeeLwf: Number(r?.employee_lwf ?? 0),
      entryCount: Number(r?.entry_count ?? 0),
    };
  }

  async siteInvoiceExists(siteId: string, month: number, year: number): Promise<boolean> {
    const { rows } = await query(
      `SELECT 1 FROM invoices WHERE site_id = $1 AND month = $2 AND year = $3 AND NOT is_deleted`,
      [siteId, month, year],
    );
    return rows.length > 0;
  }

  buildContextFromRows(input: {
    clientRow: Record<string, unknown>;
    configRow: Record<string, unknown> | null;
    contractRow: Record<string, unknown> | null;
    companyState: string | null;
    enabledComponents: Record<string, unknown>[];
    month: number;
    year: number;
    workingDays: number;
    attendanceRegisterId: string | null;
    payrollRunId: string | null;
  }): BillingEngineContext {
    const config = input.configRow;
    const contract = input.contractRow;

    const billingType = String(config?.billing_type ?? contract?.billing_type ?? 'monthly');
    const serviceChargePct = Number(
      config?.service_charge_pct ?? contract?.service_charge_pct ?? BILLING_STATUTORY_DEFAULTS.SERVICE_CHARGE_PCT,
    );
    const gstPct = Number(config?.gst_pct ?? contract?.gst_pct ?? BILLING_STATUTORY_DEFAULTS.GST_PCT);
    const gstType = String(config?.gst_type ?? 'cgst_sgst');
    const pfPct = Number(
      config?.pf_pct ?? contract?.pf_pct ?? BILLING_STATUTORY_DEFAULTS.PF_PCT,
    );
    const esicPct = Number(
      config?.esic_pct ?? contract?.esic_pct ?? BILLING_STATUTORY_DEFAULTS.ESIC_PCT,
    );
    const lwfPct = Number(
      config?.lwf_pct ?? contract?.lwf_pct ?? BILLING_STATUTORY_DEFAULTS.LWF_PCT,
    );

    return {
      clientId: String(input.clientRow.client_id),
      clientName: String(input.clientRow.company_name),
      clientState: input.clientRow.client_state ? String(input.clientRow.client_state) : null,
      clientGstNumber: input.clientRow.gst_number ? String(input.clientRow.gst_number) : null,
      siteId: String(input.clientRow.site_id),
      siteName: String(input.clientRow.site_name),
      siteState: input.clientRow.site_state ? String(input.clientRow.site_state) : null,
      month: input.month,
      year: input.year,
      workingDays: input.workingDays,
      companyState: input.companyState,
      billingConfigurationId: config?.id ? String(config.id) : null,
      contractId: contract?.id ? String(contract.id) : config?.contract_id ? String(config.contract_id) : null,
      attendanceRegisterId: input.attendanceRegisterId,
      payrollRunId: input.payrollRunId,
      billingType,
      serviceChargePct,
      gstPct,
      gstType,
      sacCode: String(config?.sac_code ?? '998519'),
      natureOfService: String(config?.nature_of_service ?? 'Manpower Supply Services'),
      invoiceNotes: config?.invoice_notes ? String(config.invoice_notes) : null,
      pfPct,
      esicPct,
      lwfPct,
      enabledComponents: input.enabledComponents.map((row) => ({
        code: String(row.code),
        name: String(row.name),
        isEnabled: Boolean(row.is_enabled),
        isTaxable: Boolean(row.is_taxable),
        hsnSacCode: row.hsn_sac_code ? String(row.hsn_sac_code) : '998519',
        pctOverride: row.pct_override != null ? Number(row.pct_override) : null,
        rateOverride: row.rate_override != null ? Number(row.rate_override) : null,
      })),
    };
  }
}

export const billingEngineRepository = new BillingEngineRepository();
