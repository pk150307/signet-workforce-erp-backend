import { query, withTransaction } from '../../database/pool';
import {
  CursorPaginatedResult,
  finalizeCursorPage,
  parseCursorPaginationQuery,
  buildCursorSql,
  CursorSortField,
} from '../../types';
import { formatDateTime, toNumber } from '../../utils/formatters';
import { buildExcelBuffer } from '../../utils/excel-export';
import { buildPdfTableBuffer } from '../../utils/pdf-export';
import { NotFoundError } from '../../common/errors';
import {
  SalaryRegisterDetail,
  SalaryRegisterEmployeeRow,
  SalaryRegisterFilter,
  SalaryRegisterListItem,
  SalaryRegisterStatus,
  SalaryRowValidationStatus,
} from './salary-register.types';
import { normalizeSalaryStatutoryConfig, SalaryStatutoryConfig } from './salary-register.calculation';
import { PoolClient } from 'pg';
import { executeBatchInsert } from '../../utils/batch-insert';

export interface SourceEmployeeForSalary {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  softCode: string | null;
  fatherName: string | null;
  designation: string | null;
  aadhaarNumber: string | null;
  accountNumber: string | null;
  uanNumber: string | null;
  esiNumber: string | null;
  basicSalary: number;
  hra: number;
  pfEligible: boolean;
  esiEligible: boolean;
  lwfEligible: boolean;
  employeePfPercentage: number | null;
  employeeEsiPercentage: number | null;
  employeeLwfPercentage: number | null;
  employeePfMaxAmount: number | null;
  employeeEsiMaxAmount: number | null;
  employeeLwfMaxAmount: number | null;
  attendanceExtrasId: string | null;
  presentDays: number | null;
  /** Attendance OT amount in rupees (column name overtime_hours). */
  otAmount: number;
  nightAllowance: number;
  punctualityAward: number;
  bonus: number;
}

export interface InsertSalaryRegisterHeader {
  clientId: string;
  month: number;
  year: number;
  runNumber: number;
  attendanceRegisterId: string | null;
  monthDays: number;
  configSnapshot: SalaryStatutoryConfig;
  status: SalaryRegisterStatus;
  createdBy: string;
}

export interface InsertSalaryEmployeeRow {
  salaryRegisterId: string;
  employeeId: string;
  sourceAttendanceExtrasId: string | null;
  softCode: string | null;
  employeeCode: string;
  employeeName: string;
  fatherName: string | null;
  designation: string | null;
  aadhaarNumber: string | null;
  accountNumber: string | null;
  uanNumber: string | null;
  esiNumber: string | null;
  monthDays: number;
  payDays: number;
  otHours: number | null;
  basicSalary: number;
  hra: number;
  fixedTotal: number;
  earningBasic: number;
  earningHra: number;
  otAmount: number;
  nAll: number;
  grossEarnings: number;
  attAwAfd: number;
  grossTotal: number;
  esic: number;
  epf: number;
  lwf: number;
  totalDeduction: number;
  netPay: number;
  otBasis: string | null;
  pfEligible: boolean;
  esiEligible: boolean;
  lwfEligible: boolean;
  validationStatus: SalaryRowValidationStatus;
  validationMessages: string[];
  calculationVersion: number;
  rowStatus: 'calculated' | 'adjusted' | 'excluded';
}

const EXPORT_HEADERS = [
  'Soft Code',
  'Employee Code',
  'Employee Name',
  'Father Name',
  'Designation',
  'Month Days',
  'Pay Days',
  'OT Hours',
  'Basic',
  'HRA',
  'Fixed Total',
  'Earning Basic',
  'Earning HRA',
  'OT Amount',
  'N.ALL',
  'Gross Earnings',
  'ATT/AW AFD',
  'Gross Total',
  'ESIC',
  'EPF',
  'LWF',
  'T.DED',
  'NET.PAY',
  'Aadhaar',
  'A/C No',
  'UAN',
  'ESI No',
  'PF Eligible',
  'ESI Eligible',
  'LWF Eligible',
  'Validation',
] as const;

const SALARY_PDF_OMIT_HEADERS = [
  'Aadhaar',
  'A/C No',
  'UAN',
  'ESI No',
  'PF Eligible',
  'ESI Eligible',
  'LWF Eligible',
  'Validation',
] as const;

export class SalaryRegisterRepository {
  async findClient(clientId: string): Promise<{
    id: string;
    companyName: string;
    clientCode: string | null;
    address: string | null;
  } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, company_name, client_code, address, city, state, pin_code
       FROM clients WHERE id = $1::uuid AND NOT is_deleted`,
      [clientId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    const parts = [r.address, r.city, r.state, r.pin_code].filter(Boolean).map(String);
    return {
      id: String(r.id),
      companyName: String(r.company_name),
      clientCode: r.client_code ? String(r.client_code) : null,
      address: parts.length ? parts.join(', ') : null,
    };
  }

  async findAttendanceRegister(
    clientId: string,
    month: number,
    year: number,
  ): Promise<{ id: string; status: string } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, status FROM attendance_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3`,
      [clientId, month, year],
    );
    if (!rows[0]) return null;
    return { id: String(rows[0].id), status: String(rows[0].status) };
  }

  async findFinalizedForPeriod(
    clientId: string,
    month: number,
    year: number,
  ): Promise<string | null> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM salary_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3 AND status = 'finalized'
       LIMIT 1`,
      [clientId, month, year],
    );
    return rows[0]?.id ?? null;
  }

  async findOpenDraftForPeriod(
    clientId: string,
    month: number,
    year: number,
  ): Promise<string | null> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM salary_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3
         AND status IN ('draft', 'calculated', 'reviewed', 'reopened')
       ORDER BY run_number DESC
       LIMIT 1`,
      [clientId, month, year],
    );
    return rows[0]?.id ?? null;
  }

  async nextRunNumber(clientId: string, month: number, year: number): Promise<number> {
    const { rows } = await query<{ max: string | null }>(
      `SELECT MAX(run_number)::text AS max FROM salary_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3`,
      [clientId, month, year],
    );
    return (Number(rows[0]?.max) || 0) + 1;
  }

  async loadSourceEmployees(
    clientId: string,
    month: number,
    year: number,
  ): Promise<SourceEmployeeForSalary[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT DISTINCT ON (e.id)
                e.id AS employee_id, e.employee_code, e.first_name, e.last_name,
                COALESCE(e.client_soft_code, eed.client_soft_code) AS soft_code,
                epd.father_name,
                des.name AS designation,
                e.aadhaar_number, e.account_number, e.uan_number, e.esi_number,
                COALESCE(e.basic_salary, 0) AS basic_salary,
                COALESCE(e.house_rent_allowance, 0) AS hra,
                COALESCE(esd.is_pf_applicable, TRUE) AS pf_eligible,
                COALESCE(esd.is_esi_applicable, TRUE) AS esi_eligible,
                COALESCE(esd.is_lwf_applicable, TRUE) AS lwf_eligible,
                esd.employee_pf_percentage, esd.employee_esi_percentage, esd.employee_lwf_percentage,
                esd.employee_pf_max_amount, esd.employee_esi_max_amount, esd.employee_lwf_max_amount,
                aro.id AS attendance_extras_id,
                aro.present_days,
                COALESCE(aro.overtime_hours, 0) AS ot_amount,
                COALESCE(aro.night_allowance, 0) AS night_allowance,
                COALESCE(aro.punctuality_award, 0) AS punctuality_award,
                COALESCE(aro.bonus, 0) AS bonus
         FROM employees e
         INNER JOIN sites s ON s.id = e.site_id AND NOT s.is_deleted
         LEFT JOIN LATERAL (
           SELECT client_soft_code
           FROM employee_employment_details
           WHERE employee_id = e.id
           ORDER BY is_current DESC NULLS LAST, period_sequence DESC NULLS LAST, created_at DESC
           LIMIT 1
         ) eed ON TRUE
         LEFT JOIN employee_personal_details epd ON epd.employee_id = e.id
         LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id
         LEFT JOIN designations des ON des.id = e.designation_id AND NOT des.is_deleted
         LEFT JOIN attendance_registers ar
           ON ar.client_id = $1::uuid AND ar.month = $2 AND ar.year = $3
         LEFT JOIN attendance_register_employee_overtime aro
           ON aro.register_id = ar.id AND aro.employee_id = e.id
         WHERE s.client_id = $1::uuid
           AND NOT e.is_deleted
           AND e.status IN (1, 3)
         ORDER BY e.id
       ) src
       ORDER BY src.employee_code`,
      [clientId, month, year],
    );

    return rows.map((r) => ({
      employeeId: String(r.employee_id),
      employeeCode: String(r.employee_code),
      firstName: String(r.first_name),
      lastName: String(r.last_name),
      softCode: r.soft_code ? String(r.soft_code) : null,
      fatherName: r.father_name ? String(r.father_name) : null,
      designation: r.designation ? String(r.designation) : null,
      aadhaarNumber: r.aadhaar_number ? String(r.aadhaar_number) : null,
      accountNumber: r.account_number ? String(r.account_number) : null,
      uanNumber: r.uan_number ? String(r.uan_number) : null,
      esiNumber: r.esi_number ? String(r.esi_number) : null,
      basicSalary: toNumber(r.basic_salary as string),
      hra: toNumber(r.hra as string),
      pfEligible: r.pf_eligible == null ? true : Boolean(r.pf_eligible),
      esiEligible: r.esi_eligible == null ? true : Boolean(r.esi_eligible),
      lwfEligible: r.lwf_eligible == null ? true : Boolean(r.lwf_eligible),
      employeePfPercentage: r.employee_pf_percentage != null ? toNumber(r.employee_pf_percentage as string) : null,
      employeeEsiPercentage: r.employee_esi_percentage != null ? toNumber(r.employee_esi_percentage as string) : null,
      employeeLwfPercentage: r.employee_lwf_percentage != null ? toNumber(r.employee_lwf_percentage as string) : null,
      employeePfMaxAmount: r.employee_pf_max_amount != null ? toNumber(r.employee_pf_max_amount as string) : null,
      employeeEsiMaxAmount: r.employee_esi_max_amount != null ? toNumber(r.employee_esi_max_amount as string) : null,
      employeeLwfMaxAmount: r.employee_lwf_max_amount != null ? toNumber(r.employee_lwf_max_amount as string) : null,
      attendanceExtrasId: r.attendance_extras_id ? String(r.attendance_extras_id) : null,
      presentDays: r.present_days == null ? null : toNumber(r.present_days as string),
      otAmount: toNumber(r.ot_amount as string),
      nightAllowance: toNumber(r.night_allowance as string),
      punctualityAward: toNumber(r.punctuality_award as string),
      bonus: toNumber(r.bonus as string),
    }));
  }

  async insertRegister(
    input: InsertSalaryRegisterHeader,
    client?: PoolClient,
  ): Promise<string> {
    const q = client ? client.query.bind(client) : query;
    const { rows } = await q<{ id: string }>(
      `INSERT INTO salary_registers (
         client_id, month, year, status, run_number, attendance_register_id,
         month_days, config_snapshot, generated_by, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9)
       RETURNING id`,
      [
        input.clientId,
        input.month,
        input.year,
        input.status,
        input.runNumber,
        input.attendanceRegisterId,
        input.monthDays,
        JSON.stringify(input.configSnapshot),
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async insertEmployeeRows(rows: InsertSalaryEmployeeRow[], client?: PoolClient): Promise<void> {
    if (!rows.length) return;
    const queryFn = client
      ? (sql: string, params?: unknown[]) => client.query(sql, params)
      : query;

    await executeBatchInsert(
      queryFn,
      `INSERT INTO salary_register_employees (
          salary_register_id, employee_id, source_attendance_extras_id,
          soft_code, employee_code, employee_name, father_name, designation,
          aadhaar_number, account_number, uan_number, esi_number,
          month_days, pay_days, ot_hours, basic_salary, hra, fixed_total,
          earning_basic, earning_hra, ot_amount, n_all, gross_earnings,
          att_aw_afd, gross_total, esic, epf, lwf,
          total_deduction, net_pay, ot_basis, pf_eligible, esi_eligible, lwf_eligible,
          validation_status, validation_messages, calculation_version, row_status
        ) VALUES`,
      rows.map((row) => [
        row.salaryRegisterId,
        row.employeeId,
        row.sourceAttendanceExtrasId,
        row.softCode,
        row.employeeCode,
        row.employeeName,
        row.fatherName,
        row.designation,
        row.aadhaarNumber,
        row.accountNumber,
        row.uanNumber,
        row.esiNumber,
        row.monthDays,
        row.payDays,
        row.otHours,
        row.basicSalary,
        row.hra,
        row.fixedTotal,
        row.earningBasic,
        row.earningHra,
        row.otAmount,
        row.nAll,
        row.grossEarnings,
        row.attAwAfd,
        row.grossTotal,
        row.esic,
        row.epf,
        row.lwf,
        row.totalDeduction,
        row.netPay,
        row.otBasis,
        row.pfEligible,
        row.esiEligible,
        row.lwfEligible,
        row.validationStatus,
        JSON.stringify(row.validationMessages),
        row.calculationVersion,
        row.rowStatus,
      ]),
      { casts: { 36: '::jsonb' }, chunkSize: 40 },
    );
  }

  async updateRegisterTotals(
    id: string,
    totals: {
      totalEmployees: number;
      totalGrossEarnings: number;
      totalAttAwAfd: number;
      totalGross: number;
      totalEsic: number;
      totalEpf: number;
      totalLwf: number;
      totalDeductions: number;
      totalNetPay: number;
      status?: SalaryRegisterStatus;
      updatedBy: string;
    },
    client?: PoolClient,
  ): Promise<void> {
    const sql = `UPDATE salary_registers SET
        total_employees = $2,
        total_gross_earnings = $3,
        total_att_aw_afd = $4,
        total_gross = $5,
        total_esic = $6,
        total_epf = $7,
        total_lwf = $8,
        total_deductions = $9,
        total_net_pay = $10,
        status = COALESCE($11, status),
        updated_at = NOW(),
        updated_by = $12
       WHERE id = $1`;
    const params = [
      id,
      totals.totalEmployees,
      totals.totalGrossEarnings,
      totals.totalAttAwAfd,
      totals.totalGross,
      totals.totalEsic,
      totals.totalEpf,
      totals.totalLwf,
      totals.totalDeductions,
      totals.totalNetPay,
      totals.status ?? null,
      totals.updatedBy,
    ];
    if (client) await client.query(sql, params);
    else await query(sql, params);
  }

  async writeAudit(input: {
    salaryRegisterId: string;
    employeeRowId?: string | null;
    action: string;
    reason?: string | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    performedBy: string;
  }, client?: PoolClient): Promise<void> {
    const sql = `INSERT INTO salary_register_audit (
        salary_register_id, employee_row_id, action, reason, old_values, new_values, performed_by
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`;
    const params = [
      input.salaryRegisterId,
      input.employeeRowId ?? null,
      input.action,
      input.reason ?? null,
      input.oldValues ? JSON.stringify(input.oldValues) : null,
      input.newValues ? JSON.stringify(input.newValues) : null,
      input.performedBy,
    ];
    if (client) await client.query(sql, params);
    else await query(sql, params);
  }

  async list(filter: SalaryRegisterFilter): Promise<CursorPaginatedResult<SalaryRegisterListItem>> {
    const pagination = parseCursorPaginationQuery(filter);
    const params: unknown[] = [];
    const conditions: string[] = [];
    let i = 1;

    if (filter.clientId) {
      conditions.push(`sr.client_id = $${i++}::uuid`);
      params.push(filter.clientId);
    }
    if (filter.month) {
      conditions.push(`sr.month = $${i++}`);
      params.push(filter.month);
    }
    if (filter.year) {
      conditions.push(`sr.year = $${i++}`);
      params.push(filter.year);
    }
    if (filter.status) {
      conditions.push(`sr.status = $${i++}`);
      params.push(filter.status);
    }
    if (filter.search) {
      conditions.push(`(LOWER(c.company_name) LIKE $${i} OR LOWER(c.client_code) LIKE $${i})`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortFields: CursorSortField[] = [
      { column: 'sr.year', key: 'year', direction: 'DESC' },
      { column: 'sr.month', key: 'month', direction: 'DESC' },
      { column: 'sr.created_at', key: 'createdAt', direction: 'DESC' },
      { column: 'sr.id', key: 'id', direction: 'ASC' },
    ];
    const cursorSql = buildCursorSql(i, pagination, sortFields);
    const cursorExtra = cursorSql.whereClause
      ? `${conditions.length ? ' AND ' : 'WHERE '}${cursorSql.whereClause}`
      : '';
    const allParams = [...params, ...cursorSql.params];

    const { rows } = await query<Record<string, unknown>>(
      `SELECT sr.*, c.company_name, c.client_code
       FROM salary_registers sr
       INNER JOIN clients c ON c.id = sr.client_id
       ${where}${cursorExtra}
       ORDER BY ${cursorSql.orderBy}
       LIMIT $${allParams.length + 1}`,
      [...allParams, cursorSql.limit],
    );

    return finalizeCursorPage(rows, pagination, (r) => this.mapListItem(r), sortFields);
  }

  async findById(id: string): Promise<SalaryRegisterDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT sr.*, c.company_name, c.client_code, c.address, c.city, c.state, c.pin_code
       FROM salary_registers sr
       INNER JOIN clients c ON c.id = sr.client_id
       WHERE sr.id = $1::uuid`,
      [id],
    );
    if (!rows[0]) return null;

    const { rows: empRows } = await query<Record<string, unknown>>(
      `SELECT * FROM salary_register_employees
       WHERE salary_register_id = $1::uuid
       ORDER BY employee_code`,
      [id],
    );

    return this.mapDetail(rows[0], empRows.map((r) => this.mapEmployeeRow(r)));
  }

  async getHeaderStatus(id: string): Promise<{
    id: string;
    status: SalaryRegisterStatus;
    clientId: string;
    month: number;
    year: number;
    configSnapshot: SalaryStatutoryConfig;
  } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, status, client_id, month, year, config_snapshot FROM salary_registers WHERE id = $1::uuid`,
      [id],
    );
    if (!rows[0]) return null;
    return {
      id: String(rows[0].id),
      status: String(rows[0].status) as SalaryRegisterStatus,
      clientId: String(rows[0].client_id),
      month: Number(rows[0].month),
      year: Number(rows[0].year),
      configSnapshot: normalizeSalaryStatutoryConfig(
        rows[0].config_snapshot as SalaryStatutoryConfig,
      ),
    };
  }

  async getAttendanceBonus(extrasId: string | null): Promise<number> {
    if (!extrasId) return 0;
    const { rows } = await query<{ bonus: string }>(
      `SELECT COALESCE(bonus, 0)::text AS bonus
       FROM attendance_register_employee_overtime WHERE id = $1::uuid`,
      [extrasId],
    );
    return toNumber(rows[0]?.bonus);
  }

  async getEmployeeRow(registerId: string, rowId: string): Promise<SalaryRegisterEmployeeRow | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM salary_register_employees
       WHERE id = $1::uuid AND salary_register_id = $2::uuid`,
      [rowId, registerId],
    );
    if (!rows[0]) return null;
    return this.mapEmployeeRow(rows[0]);
  }

  async updateEmployeeCalculatedRow(
    rowId: string,
    calculated: InsertSalaryEmployeeRow,
    client?: PoolClient,
  ): Promise<void> {
    const sql = `UPDATE salary_register_employees SET
        pay_days = $2, n_all = $3, att_aw_afd = $4,
        fixed_total = $5, earning_basic = $6, earning_hra = $7, ot_amount = $8,
        gross_earnings = $9, gross_total = $10, esic = $11, epf = $12, lwf = $13,
        total_deduction = $14, net_pay = $15,
        validation_status = $16, validation_messages = $17::jsonb,
        calculation_version = calculation_version + 1,
        row_status = $18,
        updated_at = NOW()
       WHERE id = $1`;
    const params = [
      rowId,
      calculated.payDays,
      calculated.nAll,
      calculated.attAwAfd,
      calculated.fixedTotal,
      calculated.earningBasic,
      calculated.earningHra,
      calculated.otAmount,
      calculated.grossEarnings,
      calculated.grossTotal,
      calculated.esic,
      calculated.epf,
      calculated.lwf,
      calculated.totalDeduction,
      calculated.netPay,
      calculated.validationStatus,
      JSON.stringify(calculated.validationMessages),
      calculated.rowStatus,
    ];
    if (client) await client.query(sql, params);
    else await query(sql, params);
  }

  async deleteEmployeeRows(registerId: string, client?: PoolClient): Promise<void> {
    const sql = `DELETE FROM salary_register_employees WHERE salary_register_id = $1::uuid`;
    if (client) await client.query(sql, [registerId]);
    else await query(sql, [registerId]);
  }

  async setStatus(
    id: string,
    status: SalaryRegisterStatus,
    user: string,
    extras?: { finalize?: boolean; reopen?: boolean },
  ): Promise<void> {
    await query(
      `UPDATE salary_registers SET
         status = $2,
         finalized_at = CASE WHEN $3 THEN NOW() ELSE finalized_at END,
         finalized_by = CASE WHEN $3 THEN $4 ELSE finalized_by END,
         reopened_at = CASE WHEN $5 THEN NOW() ELSE reopened_at END,
         reopened_by = CASE WHEN $5 THEN $4 ELSE reopened_by END,
         updated_at = NOW(),
         updated_by = $4
       WHERE id = $1`,
      [id, status, Boolean(extras?.finalize), user, Boolean(extras?.reopen)],
    );
  }

  private buildExportDataRows(
    detail: SalaryRegisterDetail,
  ): Array<Array<string | number | null | undefined>> {
    return detail.employees.map((e) => [
      e.softCode ?? '',
      e.employeeCode,
      e.employeeName,
      e.fatherName ?? '',
      e.designation ?? '',
      e.monthDays,
      e.payDays,
      e.otHours ?? '',
      e.basicSalary,
      e.hra,
      e.fixedTotal,
      e.earningBasic,
      e.earningHra,
      e.otAmount,
      e.nAll,
      e.grossEarnings,
      e.attAwAfd,
      e.grossTotal,
      e.esic,
      e.epf,
      e.lwf,
      e.totalDeduction,
      e.netPay,
      e.aadhaarNumber ?? '',
      e.accountNumber ?? '',
      e.uanNumber ?? '',
      e.esiNumber ?? '',
      e.pfEligible ? 'Y' : 'N',
      e.esiEligible ? 'Y' : 'N',
      e.lwfEligible ? 'Y' : 'N',
      e.validationStatus,
    ]);
  }

  async exportExcel(id: string): Promise<Buffer> {
    const detail = await this.findById(id);
    if (!detail) throw new NotFoundError('Salary register', id);
    return buildExcelBuffer('Salary Register', [...EXPORT_HEADERS], this.buildExportDataRows(detail));
  }

  async exportPdf(id: string): Promise<Buffer> {
    const detail = await this.findById(id);
    if (!detail) throw new NotFoundError('Salary register', id);
    const period = `${String(detail.month).padStart(2, '0')}/${detail.year}`;
    const clientPart = detail.clientCode
      ? `${detail.clientName} (${detail.clientCode})`
      : detail.clientName;
    return buildPdfTableBuffer({
      title: 'Salary Register',
      subtitle: `${clientPart} · ${period}`,
      headers: [...EXPORT_HEADERS],
      rows: this.buildExportDataRows(detail),
      landscape: true,
      omitHeaders: [...SALARY_PDF_OMIT_HEADERS],
    });
  }

  withTransaction = withTransaction;

  private mapListItem(r: Record<string, unknown>): SalaryRegisterListItem {
    return {
      id: String(r.id),
      clientId: String(r.client_id),
      clientName: String(r.company_name),
      clientCode: r.client_code ? String(r.client_code) : null,
      month: Number(r.month),
      year: Number(r.year),
      status: String(r.status) as SalaryRegisterStatus,
      runNumber: Number(r.run_number),
      totalEmployees: Number(r.total_employees ?? 0),
      totalGross: toNumber(r.total_gross as string),
      totalDeductions: toNumber(r.total_deductions as string),
      totalNetPay: toNumber(r.total_net_pay as string),
      generatedAt: formatDateTime(r.generated_at as Date)!,
      generatedBy: String(r.generated_by ?? ''),
      finalizedAt: formatDateTime(r.finalized_at as Date | null),
      finalizedBy: r.finalized_by ? String(r.finalized_by) : null,
    };
  }

  private mapEmployeeRow(r: Record<string, unknown>): SalaryRegisterEmployeeRow {
    let messages: string[] = [];
    const raw = r.validation_messages;
    if (Array.isArray(raw)) messages = raw.map(String);
    else if (typeof raw === 'string') {
      try {
        messages = JSON.parse(raw);
      } catch {
        messages = [];
      }
    }

    return {
      id: String(r.id),
      salaryRegisterId: String(r.salary_register_id),
      employeeId: String(r.employee_id),
      sourceAttendanceExtrasId: r.source_attendance_extras_id
        ? String(r.source_attendance_extras_id)
        : null,
      softCode: r.soft_code ? String(r.soft_code) : null,
      employeeCode: String(r.employee_code),
      employeeName: String(r.employee_name),
      fatherName: r.father_name ? String(r.father_name) : null,
      designation: r.designation ? String(r.designation) : null,
      aadhaarNumber: r.aadhaar_number ? String(r.aadhaar_number) : null,
      accountNumber: r.account_number ? String(r.account_number) : null,
      uanNumber: r.uan_number ? String(r.uan_number) : null,
      esiNumber: r.esi_number ? String(r.esi_number) : null,
      monthDays: Number(r.month_days),
      payDays: toNumber(r.pay_days as string),
      otHours: r.ot_hours == null ? null : toNumber(r.ot_hours as string),
      basicSalary: toNumber(r.basic_salary as string),
      hra: toNumber(r.hra as string),
      fixedTotal: toNumber(r.fixed_total as string),
      earningBasic: toNumber(r.earning_basic as string),
      earningHra: toNumber(r.earning_hra as string),
      otAmount: toNumber(r.ot_amount as string),
      nAll: toNumber(r.n_all as string),
      grossEarnings: toNumber(r.gross_earnings as string),
      attAwAfd: toNumber(r.att_aw_afd as string),
      grossTotal: toNumber(r.gross_total as string),
      esic: toNumber(r.esic as string),
      epf: toNumber(r.epf as string),
      lwf: toNumber(r.lwf as string),
      totalDeduction: toNumber(r.total_deduction as string),
      netPay: toNumber(r.net_pay as string),
      otBasis: r.ot_basis ? String(r.ot_basis) : null,
      pfEligible: Boolean(r.pf_eligible),
      esiEligible: Boolean(r.esi_eligible),
      lwfEligible: Boolean(r.lwf_eligible),
      validationStatus: String(r.validation_status) as SalaryRowValidationStatus,
      validationMessages: messages,
      calculationVersion: Number(r.calculation_version ?? 1),
      rowStatus: String(r.row_status) as 'calculated' | 'adjusted' | 'excluded',
    };
  }

  private mapDetail(
    r: Record<string, unknown>,
    employees: SalaryRegisterEmployeeRow[],
  ): SalaryRegisterDetail {
    const parts = [r.address, r.city, r.state, r.pin_code].filter(Boolean).map(String);
    return {
      id: String(r.id),
      clientId: String(r.client_id),
      clientName: String(r.company_name),
      clientCode: r.client_code ? String(r.client_code) : null,
      clientAddress: parts.length ? parts.join(', ') : null,
      month: Number(r.month),
      year: Number(r.year),
      status: String(r.status) as SalaryRegisterStatus,
      runNumber: Number(r.run_number),
      attendanceRegisterId: r.attendance_register_id ? String(r.attendance_register_id) : null,
      monthDays: Number(r.month_days),
      configSnapshot: normalizeSalaryStatutoryConfig(r.config_snapshot as SalaryStatutoryConfig),
      summary: {
        totalEmployees: Number(r.total_employees ?? employees.length),
        totalGrossEarnings: toNumber(r.total_gross_earnings as string),
        totalAttAwAfd: toNumber(r.total_att_aw_afd as string),
        totalGross: toNumber(r.total_gross as string),
        totalEsic: toNumber(r.total_esic as string),
        totalEpf: toNumber(r.total_epf as string),
        totalLwf: toNumber(r.total_lwf as string),
        totalDeductions: toNumber(r.total_deductions as string),
        totalNetPay: toNumber(r.total_net_pay as string),
      },
      generatedAt: formatDateTime(r.generated_at as Date)!,
      generatedBy: String(r.generated_by ?? ''),
      finalizedAt: formatDateTime(r.finalized_at as Date | null),
      finalizedBy: r.finalized_by ? String(r.finalized_by) : null,
      reopenedAt: formatDateTime(r.reopened_at as Date | null),
      reopenedBy: r.reopened_by ? String(r.reopened_by) : null,
      employees,
    };
  }
}

export const salaryRegisterRepository = new SalaryRegisterRepository();
