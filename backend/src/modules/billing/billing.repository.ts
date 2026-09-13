import { query } from '../../database/pool';
import {
  CursorPaginatedResult,
  buildCursorSql,
  finalizeCursorPage,
  parseCursorPaginationQuery,
} from '../../types';
import { InvoiceStatus, EmployeeStatus } from '../../types/enums';
import { formatDate, formatDateTime, round2, toNumber } from '../../utils/formatters';
import { nextInvoiceNumber } from '../../utils/next-code';
import { companyRepository } from '../company/company.repository';
import {
  InvoiceDetailDto,
  InvoiceLineItemDto,
  InvoicePrintCompany,
  InvoiceTimelineEntry,
} from './billing.types';
import { countBillableDays, SiteEmployeeBillingRow } from './billing.calculation';
import { resolveStatutoryConfig } from '../statutory/statutory.calculation';

export const STATUS_LABELS: Record<number, string> = {
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
      `SELECT id, description, quantity, unit_rate, amount, hsn_sac_code, component_code
       FROM invoice_line_items WHERE invoice_id = $1 AND NOT is_deleted ORDER BY sort_order`,
      [id],
    );

    const timeline = await this.getTimeline(id);
    const company = await this.getCompanyProfile();

    return this.mapInvoiceDetail(invoice, lineItems, timeline, company);
  }

  async findBySite(
    siteId: string,
    filter: {
      pageSize: number;
      cursor?: string | null;
      direction?: 'next' | 'prev';
      page?: number;
      month?: number;
      year?: number;
    },
  ): Promise<CursorPaginatedResult<InvoiceDetailDto>> {
    const pagination = parseCursorPaginationQuery(filter);
    const conditions = ['NOT i.is_deleted', 'i.site_id = $1'];
    const params: unknown[] = [siteId];
    let i = 2;

    if (filter.month) {
      conditions.push(`i.month = $${i++}`);
      params.push(filter.month);
    }
    if (filter.year) {
      conditions.push(`i.year = $${i++}`);
      params.push(filter.year);
    }

    const sortFields = [
      { column: 'i.invoice_date', key: 'invoiceDate', direction: 'DESC' as const },
      { column: 'i.id', key: 'id', direction: 'DESC' as const },
    ];
    const cursorSql = buildCursorSql(i, pagination, sortFields);
    if (cursorSql.whereClause) {
      conditions.push(cursorSql.whereClause);
      params.push(...cursorSql.params);
      i += cursorSql.params.length;
    }

    const where = conditions.join(' AND ');
    const { rows } = await query<Record<string, unknown>>(
      `SELECT i.*, c.company_name, c.id AS client_id, s.site_name, s.site_code
       FROM invoices i
       INNER JOIN clients c ON c.id = i.client_id
       LEFT JOIN sites s ON s.id = i.site_id
       WHERE ${where}
       ORDER BY ${cursorSql.orderBy}
       LIMIT $${i}`,
      [...params, cursorSql.limit],
    );

    const mapped = await Promise.all(
      rows.map(async (row) => {
        const { rows: lineItems } = await query<Record<string, unknown>>(
          `SELECT id, description, quantity, unit_rate, hsn_sac_code
           FROM invoice_line_items WHERE invoice_id = $1 AND NOT is_deleted ORDER BY sort_order`,
          [row.id],
        );
        return { row, item: this.mapInvoiceDetail(row, lineItems, [], null) };
      }),
    );

    return finalizeCursorPage(
      mapped,
      pagination,
      (entry) => entry.item,
      sortFields,
      { getCursorRow: (entry) => entry.row },
    );
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
              COALESCE(ed.basic_salary, e.basic_salary, dg.basic_salary, 0) AS basic_salary,
              COALESCE(ed.house_rent_allowance, e.house_rent_allowance, dg.house_rent_allowance, 0) AS house_rent_allowance,
              COALESCE(ed.special_allowance, e.special_allowance, dg.special_allowance, 0) AS special_allowance,
              COALESCE(
                NULLIF(
                  COALESCE(ed.basic_salary, e.basic_salary, 0)
                    + COALESCE(ed.house_rent_allowance, e.house_rent_allowance, 0)
                    + COALESCE(ed.special_allowance, e.special_allowance, 0),
                  0
                ),
                NULLIF(
                  COALESCE(dg.basic_salary, 0) + COALESCE(dg.house_rent_allowance, 0) + COALESCE(dg.special_allowance, 0),
                  0
                ),
                ed.gross_salary,
                e.gross_salary
              ) AS gross_salary,
              dg.is_pf_applicable AS grade_is_pf_applicable,
              dg.is_esi_applicable AS grade_is_esi_applicable,
              dg.is_lwf_applicable AS grade_is_lwf_applicable,
              dg.employee_pf_percentage AS grade_employee_pf_percentage,
              dg.employee_esi_percentage AS grade_employee_esi_percentage,
              dg.employee_lwf_percentage AS grade_employee_lwf_percentage,
              dg.employee_lwf_max_amount AS grade_employee_lwf_max_amount,
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

    const legacyPresentMap = new Map<string, number>();
    for (const row of attendanceRows) {
      const empId = String(row.employee_id);
      const days = countBillableDays(Number(row.status)) * Number(row.day_count);
      legacyPresentMap.set(empId, round2((legacyPresentMap.get(empId) ?? 0) + days));
    }

    const { rows: registerExtrasRows } = await query<Record<string, unknown>>(
      `SELECT aro.employee_id,
              SUM(aro.present_days)::float AS present_days,
              COALESCE(SUM(aro.overtime_hours), 0)::float AS overtime_amount,
              COALESCE(SUM(aro.night_allowance), 0)::float AS night_allowance,
              COALESCE(SUM(aro.punctuality_award), 0)::float AS punctuality_award,
              COALESCE(SUM(aro.bonus), 0)::float AS bonus
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
          presentDays: r.present_days == null ? null : Number(r.present_days),
          overtimePay: Number(r.overtime_amount) || 0,
          nightAllowance: Number(r.night_allowance) || 0,
          punctualityAward: Number(r.punctuality_award) || 0,
          bonus: Number(r.bonus) || 0,
        },
      ]),
    );

    return rows.map((row) => {
      const employeeId = String(row.id);
      const extras = extrasMap.get(employeeId) ?? {
        presentDays: null,
        overtimePay: 0,
        nightAllowance: 0,
        punctualityAward: 0,
        bonus: 0,
      };
      const hasGrade = row.designation_grade_id != null;
      const overtimePay = round2(extras.overtimePay);
      const statutoryConfig = resolveStatutoryConfig(
        hasGrade
          ? {
              is_pf_applicable: row.grade_is_pf_applicable as boolean | null,
              is_esi_applicable: row.grade_is_esi_applicable as boolean | null,
              is_lwf_applicable: row.grade_is_lwf_applicable as boolean | null,
              employee_pf_percentage: row.grade_employee_pf_percentage as string | null,
              employee_esi_percentage: row.grade_employee_esi_percentage as string | null,
              employee_lwf_percentage: row.grade_employee_lwf_percentage as string | null,
              employee_lwf_max_amount: row.grade_employee_lwf_max_amount as string | null,
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
      const presentDays = extras.presentDays != null
        ? round2(extras.presentDays)
        : (legacyPresentMap.get(employeeId) ?? 0);
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
        presentDays,
        overtimePay,
        nightAllowance: extras.nightAllowance,
        punctualityAward: extras.punctualityAward,
        bonus: round2(extras.bonus),
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
      logoUrl: profile.logoUrl ?? null,
      pfEstablishmentCode: null,
      esicCode: null,
      bankName: null,
      bankAccountNumber: null,
      bankIfsc: null,
      bankBranch: null,
    };
  }

  async getInvoiceStatus(id: string): Promise<{
    status: number;
    paidAmount: number;
    totalAmount: number;
    isLocked: boolean;
  } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT status, paid_amount, total_amount, is_locked FROM invoices WHERE id = $1 AND NOT is_deleted`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      status: Number(row.status),
      paidAmount: toNumber(row.paid_amount as string),
      totalAmount: toNumber(row.total_amount as string),
      isLocked: Boolean(row.is_locked),
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
      amount:
        li.amount != null
          ? toNumber(li.amount as string)
          : round2(Number(li.quantity) * toNumber(li.unit_rate as string)),
      hsnSacCode: li.hsn_sac_code ? String(li.hsn_sac_code) : null,
      componentCode: li.component_code ? String(li.component_code) : null,
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


export const billingRepository = new BillingRepository();
