import { query } from '../../database/pool';
import {
  CreateSiteInvoiceInput,
  GenerateSiteInvoicesInput,
  GeneratedSiteInvoice,
  InvoiceDetailDto,
  InvoiceLineItemDto,
  InvoicePreviewDto,
  InvoicePrintCompany,
  InvoiceTimelineEntry,
  SuggestedInvoiceLineItem,
  UpdateInvoiceInput,
  UpdateInvoiceStatusInput,
} from './billing.types';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { InvoiceStatus, EmployeeStatus } from '../../types/enums';
import { countWorkingDays, formatDate, formatDateTime, round2, toNumber, monthName } from '../../utils/formatters';
import { nextInvoiceNumber } from '../../utils/next-code';
import { AppError, NotFoundError } from '../../common/errors';
import { companyRepository } from '../company/company.repository';
import {
  aggregateByDepartment,
  aggregateByDesignationGrade,
  countBillableDays,
  DEFAULT_HSN_SAC,
  SiteEmployeeBillingRow,
} from './billing.calculation';
import { resolveStatutoryConfig } from '../statutory/statutory.calculation';

const STATUS_LABELS: Record<number, string> = {
  [InvoiceStatus.Draft]: 'Draft',
  [InvoiceStatus.Sent]: 'Sent',
  [InvoiceStatus.Viewed]: 'Viewed',
  [InvoiceStatus.PartiallyPaid]: 'Partially Paid',
  [InvoiceStatus.Paid]: 'Paid',
  [InvoiceStatus.Overdue]: 'Overdue',
  [InvoiceStatus.Cancelled]: 'Cancelled',
};

const ALLOWED_STATUS_TRANSITIONS: Record<number, number[]> = {
  [InvoiceStatus.Draft]: [InvoiceStatus.Sent, InvoiceStatus.Cancelled],
  [InvoiceStatus.Sent]: [
    InvoiceStatus.Viewed,
    InvoiceStatus.PartiallyPaid,
    InvoiceStatus.Paid,
    InvoiceStatus.Overdue,
    InvoiceStatus.Cancelled,
  ],
  [InvoiceStatus.Viewed]: [
    InvoiceStatus.PartiallyPaid,
    InvoiceStatus.Paid,
    InvoiceStatus.Overdue,
    InvoiceStatus.Cancelled,
  ],
  [InvoiceStatus.PartiallyPaid]: [InvoiceStatus.Paid, InvoiceStatus.Overdue, InvoiceStatus.Cancelled],
  [InvoiceStatus.Paid]: [],
  [InvoiceStatus.Overdue]: [InvoiceStatus.PartiallyPaid, InvoiceStatus.Paid, InvoiceStatus.Cancelled],
  [InvoiceStatus.Cancelled]: [],
};

export class BillingRepository {
  async findById(id: string): Promise<InvoiceDetailDto | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT i.*, c.company_name, c.id AS client_id,
              c.address AS client_address, c.city AS client_city, c.state AS client_state,
              c.pin_code AS client_pin_code, c.gst_number AS client_gst_number,
              s.site_name, s.site_code
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

    const timeline = await this.getTimeline(id);
    const company = await this.getCompanyProfile();

    return this.mapInvoiceDetail(invoice, lineItems, timeline, company);
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
      items.push(this.mapInvoiceDetail(row, lineItems, [], null));
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
    const invoiceNumber = await nextInvoiceNumber(data.year, data.month);

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

  async countEmployeesAtSiteByDepartment(siteId: string) {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.department_id, d.name AS department_name, COUNT(*)::int AS headcount
       FROM employees e
       INNER JOIN departments d ON d.id = e.department_id
       WHERE e.site_id = $1 AND NOT e.is_deleted AND e.status = $2 AND NOT d.is_deleted
       GROUP BY e.department_id, d.name
       ORDER BY d.name`,
      [siteId, EmployeeStatus.Active],
    );
    return rows;
  }

  async getSiteEmployeesBillingData(siteId: string, month: number, year: number): Promise<SiteEmployeeBillingRow[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.id,
              COALESCE(ed.department_id, e.department_id) AS department_id,
              d.name AS department_name,
              COALESCE(ed.designation_id, e.designation_id) AS designation_id,
              des.name AS designation_name,
              COALESCE(ed.designation_grade_id, e.designation_grade_id) AS designation_grade_id,
              dg.code AS grade_code,
              dg.name AS grade_name,
              COALESCE(dg.basic_salary, ed.basic_salary, e.basic_salary) AS basic_salary,
              COALESCE(dg.house_rent_allowance, 0) AS house_rent_allowance,
              COALESCE(dg.special_allowance, 0) AS special_allowance,
              COALESCE(
                NULLIF(
                  COALESCE(dg.basic_salary, 0) + COALESCE(dg.house_rent_allowance, 0) + COALESCE(dg.special_allowance, 0),
                  0
                ),
                ed.gross_salary,
                e.gross_salary
              ) AS gross_salary,
              dg.is_pf_applicable AS grade_is_pf_applicable,
              dg.is_esi_applicable AS grade_is_esi_applicable,
              dg.employee_pf_percentage AS grade_employee_pf_percentage,
              dg.employee_esi_percentage AS grade_employee_esi_percentage,
              dg.employer_pf_percentage AS grade_employer_pf_percentage,
              dg.employer_esi_percentage AS grade_employer_esi_percentage,
              COALESCE(esd.is_pf_applicable, TRUE) AS esd_is_pf_applicable,
              COALESCE(esd.is_esi_applicable, TRUE) AS esd_is_esi_applicable,
              esd.employee_pf_percentage AS esd_employee_pf_percentage,
              esd.employee_esi_percentage AS esd_employee_esi_percentage
       FROM employees e
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
       INNER JOIN designations des ON des.id = COALESCE(ed.designation_id, e.designation_id)
       LEFT JOIN designation_grades dg ON dg.id = COALESCE(ed.designation_grade_id, e.designation_grade_id) AND NOT dg.is_deleted
       LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id AND NOT esd.is_deleted
       WHERE COALESCE(ed.site_id, e.site_id) = $1 AND NOT e.is_deleted AND e.status = $2
       ORDER BY d.name, des.name, dg.code, e.employee_code`,
      [siteId, EmployeeStatus.Active],
    );

    if (rows.length === 0) return [];

    const employeeIds = rows.map((r) => String(r.id));
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEndDate = new Date(year, month, 0);
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;

    const { rows: attendanceRows } = await query<Record<string, unknown>>(
      `SELECT employee_id, status, COUNT(*)::int AS day_count
       FROM attendances
       WHERE employee_id = ANY($1::uuid[])
         AND attendance_date BETWEEN $2 AND $3
         AND NOT is_deleted
       GROUP BY employee_id, status`,
      [employeeIds, monthStart, monthEnd],
    );

    const presentMap = new Map<string, number>();
    for (const row of attendanceRows) {
      const empId = String(row.employee_id);
      const days = countBillableDays(Number(row.status)) * Number(row.day_count);
      presentMap.set(empId, round2((presentMap.get(empId) ?? 0) + days));
    }

    const { rows: registerExtrasRows } = await query<Record<string, unknown>>(
      `SELECT aro.employee_id,
              COALESCE(SUM(aro.overtime_hours), 0)::float AS overtime_amount,
              COALESCE(SUM(aro.night_allowance), 0)::float AS night_allowance,
              COALESCE(SUM(aro.punctuality_award), 0)::float AS punctuality_award
       FROM attendance_register_employee_overtime aro
       INNER JOIN attendance_registers ar ON ar.id = aro.register_id
       WHERE aro.employee_id = ANY($1::uuid[])
         AND ar.month = $2 AND ar.year = $3
       GROUP BY aro.employee_id`,
      [employeeIds, month, year],
    );

    const extrasMap = new Map(
      registerExtrasRows.map((r) => [
        String(r.employee_id),
        {
          overtimePay: Number(r.overtime_amount) || 0,
          nightAllowance: Number(r.night_allowance) || 0,
          punctualityAward: Number(r.punctuality_award) || 0,
        },
      ]),
    );

    return rows.map((row) => {
      const employeeId = String(row.id);
      const extras = extrasMap.get(employeeId) ?? {
        overtimePay: 0,
        nightAllowance: 0,
        punctualityAward: 0,
      };
      const hasGrade = row.designation_grade_id != null;
      const overtimePay = round2(extras.overtimePay);
      const statutoryConfig = resolveStatutoryConfig(
        hasGrade
          ? {
              is_pf_applicable: row.grade_is_pf_applicable as boolean | null,
              is_esi_applicable: row.grade_is_esi_applicable as boolean | null,
              employee_pf_percentage: row.grade_employee_pf_percentage as string | null,
              employee_esi_percentage: row.grade_employee_esi_percentage as string | null,
              employer_pf_percentage: row.grade_employer_pf_percentage as string | null,
              employer_esi_percentage: row.grade_employer_esi_percentage as string | null,
            }
          : null,
        {
          is_pf_applicable: row.esd_is_pf_applicable as boolean | null,
          is_esi_applicable: row.esd_is_esi_applicable as boolean | null,
          employee_pf_percentage: row.esd_employee_pf_percentage as string | null,
          employee_esi_percentage: row.esd_employee_esi_percentage as string | null,
        },
      );
      return {
        employeeId,
        departmentId: String(row.department_id),
        departmentName: String(row.department_name),
        designationId: String(row.designation_id),
        designationName: String(row.designation_name),
        designationGradeId: row.designation_grade_id ? String(row.designation_grade_id) : null,
        gradeCode: row.grade_code ? String(row.grade_code) : null,
        gradeName: row.grade_name ? String(row.grade_name) : null,
        basicSalary: toNumber(row.basic_salary as string),
        grossSalary: toNumber(row.gross_salary as string),
        statutoryConfig,
        presentDays: presentMap.get(employeeId) ?? 0,
        overtimePay,
        nightAllowance: extras.nightAllowance,
        punctualityAward: extras.punctualityAward,
      };
    });
  }

  async softDeleteInvoice(id: string, deletedBy: string): Promise<void> {
    await query(
      `UPDATE invoices SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
  }

  async updateInvoiceRecord(
    id: string,
    data: {
      invoiceDate?: string;
      dueDate?: string;
      gstRate?: number;
      subTotal: number;
      gstAmount: number;
      totalAmount: number;
      notes?: string | null;
      termsAndConditions?: string | null;
      updatedBy: string;
    },
  ): Promise<void> {
    await query(
      `UPDATE invoices SET
        invoice_date = COALESCE($2, invoice_date),
        due_date = COALESCE($3, due_date),
        gst_rate = COALESCE($4, gst_rate),
        sub_total = $5,
        gst_amount = $6,
        total_amount = $7,
        notes = COALESCE($8, notes),
        terms_and_conditions = COALESCE($9, terms_and_conditions),
        updated_at = NOW(),
        updated_by = $10
       WHERE id = $1 AND NOT is_deleted`,
      [
        id,
        data.invoiceDate ?? null,
        data.dueDate ?? null,
        data.gstRate ?? null,
        data.subTotal,
        data.gstAmount,
        data.totalAmount,
        data.notes ?? null,
        data.termsAndConditions ?? null,
        data.updatedBy,
      ],
    );
  }

  async replaceLineItems(
    invoiceId: string,
    lineItems: Array<{ description: string; quantity: number; unitRate: number; hsnSacCode?: string }>,
    updatedBy: string,
  ): Promise<void> {
    await query(
      `UPDATE invoice_line_items SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2
       WHERE invoice_id = $1 AND NOT is_deleted`,
      [invoiceId, updatedBy],
    );

    let sortOrder = 1;
    for (const item of lineItems) {
      await query(
        `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_rate, hsn_sac_code, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [invoiceId, item.description, item.quantity, item.unitRate, item.hsnSacCode ?? null, sortOrder++, updatedBy],
      );
    }
  }

  async updateInvoiceStatusRecord(
    id: string,
    status: number,
    paidAmount: number,
    updatedBy: string,
  ): Promise<void> {
    await query(
      `UPDATE invoices SET status = $2, paid_amount = $3, updated_at = NOW(), updated_by = $4
       WHERE id = $1 AND NOT is_deleted`,
      [id, status, paidAmount, updatedBy],
    );
  }

  async logStatusEvent(
    invoiceId: string,
    fromStatus: number | null,
    toStatus: number,
    note: string | null,
    performedBy: string,
  ): Promise<void> {
    await query(
      `INSERT INTO invoice_status_events (invoice_id, from_status, to_status, note, performed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, fromStatus, toStatus, note, performedBy],
    );
  }

  async getTimeline(invoiceId: string): Promise<InvoiceTimelineEntry[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, from_status, to_status, note, performed_by, performed_at
       FROM invoice_status_events
       WHERE invoice_id = $1
       ORDER BY performed_at DESC`,
      [invoiceId],
    );

    return rows.map((row) => {
      const toStatus = Number(row.to_status);
      const fromStatus = row.from_status != null ? Number(row.from_status) : null;
      const fromLabel = fromStatus != null ? STATUS_LABELS[fromStatus] ?? 'Unknown' : 'Created';
      const toLabel = STATUS_LABELS[toStatus] ?? 'Unknown';
      return {
        id: String(row.id),
        action: toLabel,
        description: row.note
          ? String(row.note)
          : fromStatus == null
            ? 'Invoice created'
            : `Status changed from ${fromLabel} to ${toLabel}`,
        performedBy: String(row.performed_by),
        performedAt: formatDateTime(String(row.performed_at)) ?? new Date(String(row.performed_at)).toISOString(),
      };
    });
  }

  async getCompanyProfile(): Promise<InvoicePrintCompany | null> {
    const profile = await companyRepository.getProfile();
    if (!profile) return null;
    const address = profile.billingAddress ?? profile.address;
    return {
      companyName: profile.companyName,
      legalName: profile.legalName ?? null,
      address,
      city: profile.billingCity ?? profile.city,
      state: profile.billingState ?? profile.state,
      pinCode: profile.billingPinCode ?? profile.pinCode ?? null,
      gstNumber: profile.gstNumber ?? null,
      panNumber: profile.panNumber ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
    };
  }

  async getInvoiceStatus(id: string): Promise<{ status: number; paidAmount: number; totalAmount: number } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT status, paid_amount, total_amount FROM invoices WHERE id = $1 AND NOT is_deleted`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      status: Number(row.status),
      paidAmount: toNumber(row.paid_amount as string),
      totalAmount: toNumber(row.total_amount as string),
    };
  }

  private mapInvoiceDetail(
    invoice: Record<string, unknown>,
    lineItems: Record<string, unknown>[],
    timeline: InvoiceTimelineEntry[],
    company: InvoicePrintCompany | null,
  ): InvoiceDetailDto {
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

    const clientAddressParts = [
      invoice.client_address ? String(invoice.client_address) : '',
      [invoice.client_city, invoice.client_state, invoice.client_pin_code]
        .filter(Boolean)
        .map(String)
        .join(', '),
    ].filter(Boolean);

    return {
      id: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number),
      clientId: String(invoice.client_id),
      clientName: String(invoice.company_name),
      siteId: invoice.site_id ? String(invoice.site_id) : null,
      siteName: invoice.site_name ? String(invoice.site_name) : null,
      siteCode: invoice.site_code ? String(invoice.site_code) : null,
      invoiceDate: formatDate(invoice.invoice_date as Date | string)!,
      dueDate: formatDate(invoice.due_date as Date | string)!,
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
      billingAddress: clientAddressParts.length ? clientAddressParts.join('\n') : null,
      clientGstNumber: invoice.client_gst_number ? String(invoice.client_gst_number) : null,
      clientCity: invoice.client_city ? String(invoice.client_city) : null,
      clientState: invoice.client_state ? String(invoice.client_state) : null,
      lineItems: items,
      timeline,
      company,
    };
  }
}

export class BillingService {
  private repo = new BillingRepository();

  resolveUnitRate(
    ratePerMonth: number | null,
    ratePerDay: number | null,
    workingDays: number,
  ): number {
    const monthly = ratePerMonth ?? 0;
    const daily = ratePerDay ?? 0;
    if (monthly > 0) return monthly;
    if (daily > 0) return round2(daily * workingDays);
    return 0;
  }

  resolveDailyRate(ratePerMonth: number | null, ratePerDay: number | null, workingDays: number): number {
    const daily = ratePerDay ?? 0;
    const monthly = ratePerMonth ?? 0;
    if (daily > 0) return daily;
    if (monthly > 0 && workingDays > 0) return round2(monthly / workingDays);
    return 0;
  }

  private resolveGradeDailyRate(
    employees: SiteEmployeeBillingRow[],
    designationGradeId: string,
    workingDays: number,
    siteDailyFallback: number,
  ): number {
    const emp = employees.find((e) => e.designationGradeId === designationGradeId);
    const monthlyGross = emp?.grossSalary ?? 0;
    if (monthlyGross > 0 && workingDays > 0) return round2(monthlyGross / workingDays);
    return siteDailyFallback;
  }

  private resolveDeptDailyRate(
    employees: SiteEmployeeBillingRow[],
    departmentId: string,
    workingDays: number,
    siteDailyFallback: number,
  ): number {
    const deptEmployees = employees.filter((e) => e.departmentId === departmentId);
    if (!deptEmployees.length) return siteDailyFallback;
    const avgGross =
      deptEmployees.reduce((sum, e) => sum + e.grossSalary, 0) / deptEmployees.length;
    if (avgGross > 0 && workingDays > 0) return round2(avgGross / workingDays);
    return siteDailyFallback;
  }

  private gradeMonthlyGross(
    employees: SiteEmployeeBillingRow[],
    designationGradeId: string,
  ): number {
    const emp = employees.find((e) => e.designationGradeId === designationGradeId);
    return emp?.grossSalary ?? 0;
  }

  private deptMonthlyGross(
    employees: SiteEmployeeBillingRow[],
    departmentId: string,
  ): number {
    const deptEmployees = employees.filter((e) => e.departmentId === departmentId);
    if (!deptEmployees.length) return 0;
    return round2(
      deptEmployees.reduce((sum, e) => sum + e.grossSalary, 0) / deptEmployees.length,
    );
  }

  async buildLineItemsForSite(
    site: Record<string, unknown>,
    month: number,
    year: number,
  ): Promise<Array<{ description: string; quantity: number; unitRate: number; hsnSacCode: string }>> {
    const preview = await this.buildSiteInvoicePreview(String(site.id), month, year, 18);
    return preview.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitRate: item.unitRate,
      hsnSacCode: item.hsnSacCode,
    }));
  }

  async buildSiteInvoicePreview(
    siteId: string,
    month: number,
    year: number,
    gstRate = 18,
  ): Promise<InvoicePreviewDto> {
    const site = await this.repo.getSiteForBilling(siteId);
    if (!site) throw new NotFoundError('Site', siteId);

    const clientId = String(site.client_id);
    const siteName = String(site.site_name);
    const workingDays = countWorkingDays(year, month);
    const periodLabel = monthName(month, year);
    const employees = await this.repo.getSiteEmployeesBillingData(siteId, month, year);
    const gradeAggregates = aggregateByDesignationGrade(employees, workingDays);
    const deptAggregates = aggregateByDepartment(employees, workingDays);

    const siteDailyFallback = this.resolveDailyRate(
      toNumber(site.billing_rate_per_month as string | null) || null,
      toNumber(site.billing_rate_per_day as string | null) || null,
      workingDays,
    );

    const lineItems: InvoicePreviewDto['lineItems'] = [];
    let totalManDays = 0;
    let totalOvertimePay = 0;
    let totalEmployerPf = 0;
    let totalEmployerEsi = 0;

    if (gradeAggregates.length > 0) {
      for (const grade of gradeAggregates) {
        const dailyRate = this.resolveGradeDailyRate(
          employees,
          grade.designationGradeId,
          workingDays,
          siteDailyFallback,
        );

        totalManDays = round2(totalManDays + grade.manDays);
        totalOvertimePay = round2(totalOvertimePay + grade.overtimePay);
        totalEmployerPf = round2(totalEmployerPf + grade.employerPf);
        totalEmployerEsi = round2(totalEmployerEsi + grade.employerEsi);

        if (grade.manDays > 0 && dailyRate > 0) {
          lineItems.push({
            description: `${grade.departmentName} / ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel} (${grade.headcount} staff, ${grade.manDays} man-days)`,
            quantity: grade.manDays,
            unitRate: dailyRate,
            amount: round2(grade.manDays * dailyRate),
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'manpower',
          });
        }

        if (grade.overtimePay > 0) {
          lineItems.push({
            description: `Overtime - ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: grade.overtimePay,
            amount: grade.overtimePay,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'overtime',
          });
        }

        if (grade.nightAllowance > 0) {
          lineItems.push({
            description: `Night Allowance - ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: grade.nightAllowance,
            amount: grade.nightAllowance,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'night_allowance',
          });
        }

        if (grade.punctualityAward > 0) {
          lineItems.push({
            description: `Punctuality Award - ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: grade.punctualityAward,
            amount: grade.punctualityAward,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'punctuality_award',
          });
        }
      }
    } else {
      for (const dept of deptAggregates) {
        const dailyRate = this.resolveDeptDailyRate(
          employees,
          dept.departmentId,
          workingDays,
          siteDailyFallback,
        );

        totalManDays = round2(totalManDays + dept.manDays);
        totalOvertimePay = round2(totalOvertimePay + dept.overtimePay);
        totalEmployerPf = round2(totalEmployerPf + dept.employerPf);
        totalEmployerEsi = round2(totalEmployerEsi + dept.employerEsi);

        if (dept.manDays > 0 && dailyRate > 0) {
          const amount = round2(dept.manDays * dailyRate);
          lineItems.push({
            description: `${dept.departmentName} manpower - ${siteName} - ${periodLabel} (${dept.headcount} staff, ${dept.manDays} man-days)`,
            quantity: dept.manDays,
            unitRate: dailyRate,
            amount,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'manpower',
          });
        }

        if (dept.overtimePay > 0) {
          lineItems.push({
            description: `Overtime charges - ${dept.departmentName} - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: dept.overtimePay,
            amount: dept.overtimePay,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'overtime',
          });
        }

        if (dept.nightAllowance > 0) {
          lineItems.push({
            description: `Night Allowance - ${dept.departmentName} - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: dept.nightAllowance,
            amount: dept.nightAllowance,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'night_allowance',
          });
        }

        if (dept.punctualityAward > 0) {
          lineItems.push({
            description: `Punctuality Award - ${dept.departmentName} - ${siteName} - ${periodLabel}`,
            quantity: 1,
            unitRate: dept.punctualityAward,
            amount: dept.punctualityAward,
            hsnSacCode: DEFAULT_HSN_SAC,
            category: 'punctuality_award',
          });
        }
      }
    }

    if (lineItems.length === 0 && employees.length === 0) {
      const headcount = await this.repo.countEmployeesAtSite(siteId);
      const deployedCount = headcount > 0 ? headcount : Number(site.required_headcount) || 0;
      const monthlyRate = toNumber(site.billing_rate_per_month as string | null);
      const dailyRate = toNumber(site.billing_rate_per_day as string | null);
      const unitRate = this.resolveUnitRate(
        monthlyRate > 0 ? monthlyRate : null,
        dailyRate > 0 ? dailyRate : null,
        workingDays,
      );
      if (deployedCount > 0 && unitRate > 0) {
        lineItems.push({
          description: `Manpower services - ${siteName} - ${periodLabel} (${deployedCount} personnel)`,
          quantity: deployedCount,
          unitRate,
          amount: round2(deployedCount * unitRate),
          hsnSacCode: DEFAULT_HSN_SAC,
          category: 'manpower',
        });
      }
    }

    if (totalEmployerPf > 0) {
      lineItems.push({
        description: `Employer PF contribution reimbursement - ${siteName} - ${periodLabel}`,
        quantity: 1,
        unitRate: totalEmployerPf,
        amount: totalEmployerPf,
        hsnSacCode: DEFAULT_HSN_SAC,
        category: 'pf',
      });
    }

    if (totalEmployerEsi > 0) {
      lineItems.push({
        description: `Employer ESIC contribution reimbursement - ${siteName} - ${periodLabel}`,
        quantity: 1,
        unitRate: totalEmployerEsi,
        amount: totalEmployerEsi,
        hsnSacCode: DEFAULT_HSN_SAC,
        category: 'esi',
      });
    }

    const subTotal = round2(lineItems.reduce((sum, item) => sum + item.amount, 0));
    const gstAmount = round2(subTotal * (gstRate / 100));
    const totalAmount = round2(subTotal + gstAmount);
    const alreadyInvoiced = await this.repo.siteInvoiceExists(siteId, month, year);

    return {
      siteId,
      siteName,
      clientId,
      clientName: String(site.company_name),
      month,
      year,
      workingDays,
      employeeCount: employees.length,
      totalManDays,
      totalOvertimeHours: totalOvertimePay,
      totalEmployerPf,
      totalEmployerEsi,
      subTotal,
      gstRate,
      gstAmount,
      totalAmount,
      alreadyInvoiced,
      lineItems,
    };
  }

  async getSuggestedLineItems(
    clientId: string,
    siteId: string,
    month: number,
    year: number,
  ): Promise<SuggestedInvoiceLineItem[]> {
    const site = await this.repo.getSiteForBilling(siteId);
    if (!site || String(site.client_id) !== clientId) {
      throw new NotFoundError('Site', siteId);
    }

    const workingDays = countWorkingDays(year, month);
    const periodLabel = monthName(month, year);
    const siteName = String(site.site_name);
    const employees = await this.repo.getSiteEmployeesBillingData(siteId, month, year);
    const gradeAggregates = aggregateByDesignationGrade(employees, workingDays);
    const deptAggregates = aggregateByDepartment(employees, workingDays);

    const siteDailyFallback = this.resolveDailyRate(
      toNumber(site.billing_rate_per_month as string | null) || null,
      toNumber(site.billing_rate_per_day as string | null) || null,
      workingDays,
    );

    if (gradeAggregates.length > 0) {
      const suggestions: SuggestedInvoiceLineItem[] = [];

      for (const grade of gradeAggregates) {
        const monthlyGross = this.gradeMonthlyGross(employees, grade.designationGradeId);
        const dailyRate = this.resolveGradeDailyRate(
          employees,
          grade.designationGradeId,
          workingDays,
          siteDailyFallback,
        );
        const unitRate = monthlyGross > 0 ? monthlyGross : round2(dailyRate * workingDays);
        if (unitRate <= 0) continue;

        const quantity = grade.headcount > 0 ? grade.headcount : 1;

        suggestions.push({
          departmentId: grade.departmentId,
          departmentName: grade.departmentName,
          description: `${grade.departmentName} / ${grade.designationName} (${grade.gradeCode}) - ${siteName} - ${periodLabel}`,
          quantity,
          unitRate,
          ratePerDay: dailyRate > 0 ? dailyRate : null,
          ratePerMonth: monthlyGross > 0 ? monthlyGross : null,
          hsnSacCode: '998519',
        });
      }

      if (suggestions.length > 0) return suggestions;
    }

    if (deptAggregates.length > 0) {
      const suggestions: SuggestedInvoiceLineItem[] = [];

      for (const dept of deptAggregates) {
        const monthlyGross = this.deptMonthlyGross(employees, dept.departmentId);
        const dailyRate = this.resolveDeptDailyRate(
          employees,
          dept.departmentId,
          workingDays,
          siteDailyFallback,
        );
        const unitRate = monthlyGross > 0 ? monthlyGross : round2(dailyRate * workingDays);
        if (unitRate <= 0) continue;

        const quantity = dept.headcount > 0 ? dept.headcount : 1;

        suggestions.push({
          departmentId: dept.departmentId,
          departmentName: dept.departmentName,
          description: `${dept.departmentName} services - ${siteName} - ${periodLabel}`,
          quantity,
          unitRate,
          ratePerDay: dailyRate > 0 ? dailyRate : null,
          ratePerMonth: monthlyGross > 0 ? monthlyGross : null,
          hsnSacCode: '998519',
        });
      }

      if (suggestions.length > 0) return suggestions;
    }

    const headcount = await this.repo.countEmployeesAtSite(siteId);
    const deployedCount = headcount > 0 ? headcount : Number(site.required_headcount) || 0;
    const monthlyRate = toNumber(site.billing_rate_per_month as string | null);
    const dailyRate = toNumber(site.billing_rate_per_day as string | null);
    const unitRate = this.resolveUnitRate(
      monthlyRate > 0 ? monthlyRate : null,
      dailyRate > 0 ? dailyRate : null,
      workingDays,
    );

    if (deployedCount <= 0 || unitRate <= 0) return [];

    return [
      {
        departmentId: '',
        departmentName: 'General',
        description: `Manpower services - ${siteName} - ${periodLabel}`,
        quantity: deployedCount,
        unitRate,
        ratePerDay: dailyRate > 0 ? dailyRate : null,
        ratePerMonth: monthlyRate > 0 ? monthlyRate : null,
        hsnSacCode: '998519',
      },
    ];
  }

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

  async previewSiteInvoice(siteId: string, month: number, year: number, gstRate = 18) {
    return this.buildSiteInvoicePreview(siteId, month, year, gstRate);
  }

  async generateInvoiceForSite(input: GenerateSiteInvoicesInput): Promise<GeneratedSiteInvoice> {
    if (!input.siteId) throw new AppError(400, 'siteId is required for single-site generation.');

    const site = await this.repo.getSiteForBilling(input.siteId);
    if (!site) throw new NotFoundError('Site', input.siteId);

    if (await this.repo.siteInvoiceExists(input.siteId, input.month, input.year)) {
      throw new AppError(409, `Invoice already exists for site ${site.site_name} for ${input.month}/${input.year}.`);
    }

    const gstRate = input.gstRate ?? 18;
    const preview = await this.buildSiteInvoicePreview(input.siteId, input.month, input.year, gstRate);
    if (preview.lineItems.length === 0) {
      throw new AppError(400, 'No billable data found for the selected site and period.');
    }

    const invoiceDate = new Date(input.year, input.month - 1, 1).toISOString().split('T')[0];
    const dueDate = new Date(input.year, input.month - 1, input.dueDateDays ?? 30).toISOString().split('T')[0];

    const result = await this.repo.createInvoice({
      clientId: String(site.client_id),
      siteId: input.siteId,
      invoiceDate,
      dueDate,
      month: input.month,
      year: input.year,
      gstRate,
      notes: input.notes ?? `Auto-generated invoice for ${site.site_name} (${monthName(input.month, input.year)})`,
      termsAndConditions: 'Payment due within agreed credit period. Statutory reimbursements are based on attendance records.',
      lineItems: preview.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitRate: item.unitRate,
        hsnSacCode: item.hsnSacCode,
      })),
      createdBy: input.createdBy,
    });

    await this.repo.logStatusEvent(result.id, null, InvoiceStatus.Draft, 'Invoice auto-generated from site attendance data', input.createdBy);

    return {
      siteId: input.siteId,
      siteName: String(site.site_name),
      invoiceId: result.id,
      invoiceNumber: result.invoiceNumber,
      totalAmount: result.totalAmount,
    };
  }

  async updateInvoice(id: string, input: UpdateInvoiceInput) {
    const current = await this.repo.getInvoiceStatus(id);
    if (!current) throw new NotFoundError('Invoice', id);
    if (current.status !== InvoiceStatus.Draft) {
      throw new AppError(400, 'Only draft invoices can be edited.');
    }

    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError('Invoice', id);

    const lineItems = input.lineItems ?? existing.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitRate: item.unitRate,
      hsnSacCode: item.hsnSacCode ?? undefined,
    }));

    const gstRate = input.gstRate ?? existing.gstRate;
    const subTotal = round2(lineItems.reduce((sum, li) => sum + li.quantity * li.unitRate, 0));
    const gstAmount = round2(subTotal * (gstRate / 100));
    const totalAmount = round2(subTotal + gstAmount);

    await this.repo.updateInvoiceRecord(id, {
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      gstRate: input.gstRate,
      subTotal,
      gstAmount,
      totalAmount,
      notes: input.notes,
      termsAndConditions: input.termsAndConditions,
      updatedBy: input.updatedBy,
    });

    if (input.lineItems) {
      await this.repo.replaceLineItems(id, lineItems, input.updatedBy);
    }

    return this.getInvoiceById(id);
  }

  async deleteInvoice(id: string, deletedBy: string) {
    const current = await this.repo.getInvoiceStatus(id);
    if (!current) throw new NotFoundError('Invoice', id);
    await this.repo.softDeleteInvoice(id, deletedBy);
  }

  async updateInvoiceStatus(id: string, input: UpdateInvoiceStatusInput) {
    const current = await this.repo.getInvoiceStatus(id);
    if (!current) throw new NotFoundError('Invoice', id);

    const allowed = ALLOWED_STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(input.status)) {
      throw new AppError(
        400,
        `Cannot transition from ${STATUS_LABELS[current.status] ?? 'Unknown'} to ${STATUS_LABELS[input.status] ?? 'Unknown'}.`,
      );
    }

    let paidAmount = current.paidAmount;
    if (input.status === InvoiceStatus.Paid) {
      paidAmount = input.paidAmount ?? current.totalAmount;
    } else if (input.status === InvoiceStatus.PartiallyPaid) {
      paidAmount = input.paidAmount ?? current.paidAmount;
      if (paidAmount <= 0 || paidAmount >= current.totalAmount) {
        throw new AppError(400, 'Partially paid status requires a paid amount between 0 and total.');
      }
    } else if (input.status === InvoiceStatus.Cancelled || input.status === InvoiceStatus.Sent) {
      paidAmount = input.paidAmount ?? current.paidAmount;
    }

    await this.repo.updateInvoiceStatusRecord(id, input.status, paidAmount, input.updatedBy);
    await this.repo.logStatusEvent(id, current.status, input.status, input.note ?? null, input.updatedBy);

    return this.getInvoiceById(id);
  }

  async generateInvoicesBySites(input: GenerateSiteInvoicesInput): Promise<{
    generated: number;
    skipped: number;
    invoices: GeneratedSiteInvoice[];
  }> {
    if (input.siteId) {
      const invoice = await this.generateInvoiceForSite(input);
      return { generated: 1, skipped: 0, invoices: [invoice] };
    }

    const sites = await this.repo.getActiveSites(input.siteIds);
    const gstRate = input.gstRate ?? 18;

    const invoices: GeneratedSiteInvoice[] = [];
    let skipped = 0;

    for (const site of sites) {
      const siteId = String(site.id);

      if (await this.repo.siteInvoiceExists(siteId, input.month, input.year)) {
        skipped++;
        continue;
      }

      const lineItems = await this.buildLineItemsForSite(site, input.month, input.year);
      if (lineItems.length === 0) {
        skipped++;
        continue;
      }

      const invoiceDate = new Date(input.year, input.month - 1, 1).toISOString().split('T')[0];
      const dueDate = new Date(input.year, input.month - 1, input.dueDateDays ?? 30).toISOString().split('T')[0];

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
        lineItems,
        createdBy: input.createdBy,
      });

      await this.repo.logStatusEvent(result.id, null, InvoiceStatus.Draft, 'Invoice auto-generated in bulk run', input.createdBy);

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
