import { query, withTransaction } from '../../database/pool';
import {
  CursorPaginatedResult,
  finalizeCursorPage,
  parseCursorPaginationQuery,
  buildCursorSql,
  CursorSortField,
} from '../../types';
import { formatDate, formatDateTime, roundOff, toNumber } from '../../utils/formatters';
import { buildExcelBuffer } from '../../utils/excel-export';
import { buildPdfTableBuffer } from '../../utils/pdf-export';
import { NotFoundError } from '../../common/errors';
import {
  EmployeeAdvanceDetail,
  EmployeeAdvanceEntry,
  EmployeeAdvanceFilter,
  EmployeeAdvanceListItem,
  EmployeeAdvancePayment,
  EmployeeAdvanceStatus,
} from './employee-advances.types';
import { PoolClient } from 'pg';

export interface SourceEmployeeForAdvance {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  softCode: string | null;
  designation: string | null;
  salaryNetPay: number | null;
}

export interface InsertAdvanceRegisterHeader {
  clientId: string;
  month: number;
  year: number;
  runNumber: number;
  salaryRegisterId: string | null;
  status: EmployeeAdvanceStatus;
  createdBy: string;
}

export interface InsertAdvanceEntry {
  advanceRegisterId: string;
  employeeId: string;
  softCode: string | null;
  employeeCode: string;
  employeeName: string;
  designation: string | null;
  advanceAmount: number;
  notes: string | null;
  salaryNetPay: number | null;
  payableAmount: number | null;
}

const EXPORT_HEADERS = [
  'Soft Code',
  'Employee Code',
  'Employee Name',
  'Designation',
  'Payment Date',
  'Payment Amount',
  'Payment Notes',
  'Total Advance',
  'Salary Net Pay',
  'Payable (Net − Advance)',
] as const;

export function computePayable(
  salaryNetPay: number | null,
  advanceAmount: number,
): number | null {
  if (salaryNetPay == null) return null;
  return roundOff(salaryNetPay - (advanceAmount || 0));
}

type QueryRunner = typeof query;

export class EmployeeAdvancesRepository {
  async findClient(clientId: string): Promise<{
    id: string;
    companyName: string;
    clientCode: string | null;
  } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, company_name, client_code
       FROM clients WHERE id = $1::uuid AND NOT is_deleted`,
      [clientId],
    );
    if (!rows[0]) return null;
    return {
      id: String(rows[0].id),
      companyName: String(rows[0].company_name),
      clientCode: rows[0].client_code ? String(rows[0].client_code) : null,
    };
  }

  async findSalaryRegisterForPeriod(
    clientId: string,
    month: number,
    year: number,
  ): Promise<{ id: string; status: string } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, status FROM salary_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3
       ORDER BY
         CASE status
           WHEN 'finalized' THEN 0
           WHEN 'reviewed' THEN 1
           WHEN 'calculated' THEN 2
           WHEN 'reopened' THEN 3
           ELSE 4
         END,
         run_number DESC
       LIMIT 1`,
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
      `SELECT id FROM employee_advance_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3 AND status = 'finalized'
       LIMIT 1`,
      [clientId, month, year],
    );
    return rows[0]?.id ?? null;
  }

  async findOpenForPeriod(
    clientId: string,
    month: number,
    year: number,
  ): Promise<string | null> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM employee_advance_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3
         AND status IN ('draft', 'open', 'reopened')
       ORDER BY run_number DESC
       LIMIT 1`,
      [clientId, month, year],
    );
    return rows[0]?.id ?? null;
  }

  async nextRunNumber(clientId: string, month: number, year: number): Promise<number> {
    const { rows } = await query<{ max: string | null }>(
      `SELECT MAX(run_number)::text AS max FROM employee_advance_registers
       WHERE client_id = $1::uuid AND month = $2 AND year = $3`,
      [clientId, month, year],
    );
    return (Number(rows[0]?.max) || 0) + 1;
  }

  async loadSourceEmployees(
    clientId: string,
    salaryRegisterId: string | null,
  ): Promise<SourceEmployeeForAdvance[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT DISTINCT ON (e.id)
                e.id AS employee_id, e.employee_code, e.first_name, e.last_name,
                COALESCE(e.client_soft_code, eed.client_soft_code) AS soft_code,
                des.name AS designation,
                sre.net_pay AS salary_net_pay
         FROM employees e
         INNER JOIN sites s ON s.id = e.site_id AND NOT s.is_deleted
         LEFT JOIN LATERAL (
           SELECT client_soft_code
           FROM employee_employment_details
           WHERE employee_id = e.id
           ORDER BY is_current DESC NULLS LAST, period_sequence DESC NULLS LAST, created_at DESC
           LIMIT 1
         ) eed ON TRUE
         LEFT JOIN designations des ON des.id = e.designation_id AND NOT des.is_deleted
         LEFT JOIN salary_register_employees sre
           ON sre.employee_id = e.id
          AND sre.salary_register_id = $2::uuid
         WHERE s.client_id = $1::uuid
           AND NOT e.is_deleted
           AND e.status IN (1, 3)
         ORDER BY e.id
       ) src
       ORDER BY src.employee_code`,
      [clientId, salaryRegisterId],
    );

    return rows.map((r) => ({
      employeeId: String(r.employee_id),
      employeeCode: String(r.employee_code),
      firstName: String(r.first_name),
      lastName: String(r.last_name),
      softCode: r.soft_code ? String(r.soft_code) : null,
      designation: r.designation ? String(r.designation) : null,
      salaryNetPay: r.salary_net_pay == null ? null : toNumber(r.salary_net_pay as string),
    }));
  }

  async insertRegister(
    input: InsertAdvanceRegisterHeader,
    client?: PoolClient,
  ): Promise<string> {
    const q = this.runner(client);
    const { rows } = await q<{ id: string }>(
      `INSERT INTO employee_advance_registers (
         client_id, month, year, status, run_number, salary_register_id,
         generated_by, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       RETURNING id`,
      [
        input.clientId,
        input.month,
        input.year,
        input.status,
        input.runNumber,
        input.salaryRegisterId,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async insertEntry(row: InsertAdvanceEntry, client?: PoolClient): Promise<string> {
    const q = this.runner(client);
    const { rows } = await q<{ id: string }>(
      `INSERT INTO employee_advance_entries (
          advance_register_id, employee_id, soft_code, employee_code, employee_name,
          designation, advance_amount, notes, salary_net_pay, payable_amount
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id`,
      [
        row.advanceRegisterId,
        row.employeeId,
        row.softCode,
        row.employeeCode,
        row.employeeName,
        row.designation,
        row.advanceAmount,
        row.notes,
        row.salaryNetPay,
        row.payableAmount,
      ],
    );
    return rows[0].id;
  }

  async insertEntries(rows: InsertAdvanceEntry[], client?: PoolClient): Promise<void> {
    for (const row of rows) {
      await this.insertEntry(row, client);
    }
  }

  async updateEntryIdentity(
    entryId: string,
    data: {
      softCode: string | null;
      employeeCode: string;
      employeeName: string;
      designation: string | null;
      salaryNetPay: number | null;
      payableAmount: number | null;
    },
    client?: PoolClient,
  ): Promise<void> {
    const q = this.runner(client);
    await q(
      `UPDATE employee_advance_entries SET
         soft_code = $2,
         employee_code = $3,
         employee_name = $4,
         designation = $5,
         salary_net_pay = $6,
         payable_amount = $7,
         updated_at = NOW()
       WHERE id = $1`,
      [
        entryId,
        data.softCode,
        data.employeeCode,
        data.employeeName,
        data.designation,
        data.salaryNetPay,
        data.payableAmount,
      ],
    );
  }

  async listEntriesByRegister(
    registerId: string,
    client?: PoolClient,
  ): Promise<Array<{ id: string; employeeId: string; advanceAmount: number }>> {
    const q = this.runner(client);
    const { rows } = await q<Record<string, unknown>>(
      `SELECT id, employee_id, advance_amount
       FROM employee_advance_entries WHERE advance_register_id = $1::uuid`,
      [registerId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      employeeId: String(r.employee_id),
      advanceAmount: toNumber(r.advance_amount as string),
    }));
  }

  async deleteEntriesNotInEmployees(
    registerId: string,
    employeeIds: string[],
    client?: PoolClient,
  ): Promise<void> {
    const q = this.runner(client);
    if (!employeeIds.length) {
      await q(`DELETE FROM employee_advance_entries WHERE advance_register_id = $1::uuid`, [
        registerId,
      ]);
      return;
    }
    await q(
      `DELETE FROM employee_advance_entries
       WHERE advance_register_id = $1::uuid
         AND NOT (employee_id = ANY($2::uuid[]))`,
      [registerId, employeeIds],
    );
  }

  async updateRegisterTotals(
    id: string,
    totals: {
      totalEmployees: number;
      totalAdvance: number;
      totalSalaryNetPay: number;
      totalPayable: number;
      status?: EmployeeAdvanceStatus;
      salaryRegisterId?: string | null;
      updatedBy: string;
    },
    client?: PoolClient,
  ): Promise<void> {
    const q = this.runner(client);
    await q(
      `UPDATE employee_advance_registers SET
        total_employees = $2,
        total_advance = $3,
        total_salary_net_pay = $4,
        total_payable = $5,
        status = COALESCE($6, status),
        salary_register_id = CASE WHEN $7::boolean THEN $8::uuid ELSE salary_register_id END,
        updated_at = NOW(),
        updated_by = $9
       WHERE id = $1`,
      [
        id,
        totals.totalEmployees,
        totals.totalAdvance,
        totals.totalSalaryNetPay,
        totals.totalPayable,
        totals.status ?? null,
        totals.salaryRegisterId !== undefined,
        totals.salaryRegisterId ?? null,
        totals.updatedBy,
      ],
    );
  }

  async writeAudit(
    input: {
      advanceRegisterId: string;
      entryId?: string | null;
      action: string;
      reason?: string | null;
      oldValues?: Record<string, unknown> | null;
      newValues?: Record<string, unknown> | null;
      performedBy: string;
    },
    client?: PoolClient,
  ): Promise<void> {
    const q = this.runner(client);
    await q(
      `INSERT INTO employee_advance_audit (
        advance_register_id, entry_id, action, reason, old_values, new_values, performed_by
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
      [
        input.advanceRegisterId,
        input.entryId ?? null,
        input.action,
        input.reason ?? null,
        input.oldValues ? JSON.stringify(input.oldValues) : null,
        input.newValues ? JSON.stringify(input.newValues) : null,
        input.performedBy,
      ],
    );
  }

  async list(filter: EmployeeAdvanceFilter): Promise<CursorPaginatedResult<EmployeeAdvanceListItem>> {
    const pagination = parseCursorPaginationQuery(filter);
    const params: unknown[] = [];
    const conditions: string[] = [];
    let i = 1;

    if (filter.clientId) {
      conditions.push(`ar.client_id = $${i++}::uuid`);
      params.push(filter.clientId);
    }
    if (filter.month) {
      conditions.push(`ar.month = $${i++}`);
      params.push(filter.month);
    }
    if (filter.year) {
      conditions.push(`ar.year = $${i++}`);
      params.push(filter.year);
    }
    if (filter.status) {
      conditions.push(`ar.status = $${i++}`);
      params.push(filter.status);
    }
    if (filter.search) {
      conditions.push(`(LOWER(c.company_name) LIKE $${i} OR LOWER(c.client_code) LIKE $${i})`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortFields: CursorSortField[] = [
      { column: 'ar.year', key: 'year', direction: 'DESC' },
      { column: 'ar.month', key: 'month', direction: 'DESC' },
      { column: 'ar.created_at', key: 'createdAt', direction: 'DESC' },
      { column: 'ar.id', key: 'id', direction: 'ASC' },
    ];
    const cursorSql = buildCursorSql(i, pagination, sortFields);
    const cursorExtra = cursorSql.whereClause
      ? `${conditions.length ? ' AND ' : 'WHERE '}${cursorSql.whereClause}`
      : '';
    const allParams = [...params, ...cursorSql.params];

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ar.*, c.company_name, c.client_code
       FROM employee_advance_registers ar
       INNER JOIN clients c ON c.id = ar.client_id
       ${where}${cursorExtra}
       ORDER BY ${cursorSql.orderBy}
       LIMIT $${allParams.length + 1}`,
      [...allParams, cursorSql.limit],
    );

    return finalizeCursorPage(rows, pagination, (r) => this.mapListItem(r), sortFields);
  }

  async findById(id: string): Promise<EmployeeAdvanceDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ar.*, c.company_name, c.client_code
       FROM employee_advance_registers ar
       INNER JOIN clients c ON c.id = ar.client_id
       WHERE ar.id = $1::uuid`,
      [id],
    );
    if (!rows[0]) return null;

    const { rows: entryRows } = await query<Record<string, unknown>>(
      `SELECT e.*,
              COALESCE(pc.payment_count, 0)::int AS payment_count
       FROM employee_advance_entries e
       LEFT JOIN (
         SELECT entry_id, COUNT(*)::int AS payment_count
         FROM employee_advance_payments
         GROUP BY entry_id
       ) pc ON pc.entry_id = e.id
       WHERE e.advance_register_id = $1::uuid
       ORDER BY e.employee_code`,
      [id],
    );

    const entryIds = entryRows.map((r) => String(r.id));
    const paymentsByEntry = await this.loadPaymentsByEntryIds(entryIds);
    const employees = entryRows.map((r) =>
      this.mapEntry(r, paymentsByEntry.get(String(r.id)) ?? []),
    );
    return this.mapDetail(rows[0], employees);
  }

  async getHeaderStatus(id: string): Promise<{
    id: string;
    status: EmployeeAdvanceStatus;
    clientId: string;
    month: number;
    year: number;
  } | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, status, client_id, month, year FROM employee_advance_registers WHERE id = $1::uuid`,
      [id],
    );
    if (!rows[0]) return null;
    return {
      id: String(rows[0].id),
      status: String(rows[0].status) as EmployeeAdvanceStatus,
      clientId: String(rows[0].client_id),
      month: Number(rows[0].month),
      year: Number(rows[0].year),
    };
  }

  async getEntry(registerId: string, entryId: string): Promise<EmployeeAdvanceEntry | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.*,
              COALESCE((SELECT COUNT(*) FROM employee_advance_payments p WHERE p.entry_id = e.id), 0)::int AS payment_count
       FROM employee_advance_entries e
       WHERE e.id = $1::uuid AND e.advance_register_id = $2::uuid`,
      [entryId, registerId],
    );
    if (!rows[0]) return null;
    const payments = await this.loadPaymentsByEntryIds([entryId]);
    return this.mapEntry(rows[0], payments.get(entryId) ?? []);
  }

  async insertPayment(
    input: {
      entryId: string;
      paidOn: string;
      amount: number;
      notes: string | null;
      createdBy: string;
    },
    client?: PoolClient,
  ): Promise<string> {
    const q = this.runner(client);
    const { rows } = await q<{ id: string }>(
      `INSERT INTO employee_advance_payments (entry_id, paid_on, amount, notes, created_by)
       VALUES ($1,$2::date,$3,$4,$5)
       RETURNING id`,
      [input.entryId, input.paidOn, input.amount, input.notes, input.createdBy],
    );
    return rows[0].id;
  }

  async updatePayment(
    paymentId: string,
    entryId: string,
    input: {
      paidOn: string;
      amount: number;
      notes: string | null;
      updatedBy: string;
    },
    client?: PoolClient,
  ): Promise<boolean> {
    const q = this.runner(client);
    const { rowCount } = await q(
      `UPDATE employee_advance_payments SET
         paid_on = $3::date,
         amount = $4,
         notes = $5,
         updated_at = NOW(),
         updated_by = $6
       WHERE id = $1::uuid AND entry_id = $2::uuid`,
      [paymentId, entryId, input.paidOn, input.amount, input.notes, input.updatedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async deletePayment(paymentId: string, entryId: string, client?: PoolClient): Promise<boolean> {
    const q = this.runner(client);
    const { rowCount } = await q(
      `DELETE FROM employee_advance_payments WHERE id = $1::uuid AND entry_id = $2::uuid`,
      [paymentId, entryId],
    );
    return (rowCount ?? 0) > 0;
  }

  async getPayment(
    paymentId: string,
    entryId: string,
  ): Promise<EmployeeAdvancePayment | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM employee_advance_payments WHERE id = $1::uuid AND entry_id = $2::uuid`,
      [paymentId, entryId],
    );
    if (!rows[0]) return null;
    return this.mapPayment(rows[0]);
  }

  /** Recalculate entry.advance_amount / payable from payments and return new totals. */
  async recomputeEntryTotals(entryId: string, client?: PoolClient): Promise<{
    advanceAmount: number;
    salaryNetPay: number | null;
    payableAmount: number | null;
  }> {
    const q = this.runner(client);
    const { rows } = await q<Record<string, unknown>>(
      `WITH sums AS (
         SELECT COALESCE(SUM(amount), 0) AS total
         FROM employee_advance_payments WHERE entry_id = $1::uuid
       )
       UPDATE employee_advance_entries e SET
         advance_amount = s.total,
         payable_amount = CASE
           WHEN e.salary_net_pay IS NULL THEN NULL
           ELSE ROUND(e.salary_net_pay - s.total)
         END,
         updated_at = NOW()
       FROM sums s
       WHERE e.id = $1::uuid
       RETURNING e.advance_amount, e.salary_net_pay, e.payable_amount`,
      [entryId],
    );
    const r = rows[0] ?? {};
    return {
      advanceAmount: toNumber(r.advance_amount as string),
      salaryNetPay: r.salary_net_pay == null ? null : toNumber(r.salary_net_pay as string),
      payableAmount: r.payable_amount == null ? null : toNumber(r.payable_amount as string),
    };
  }

  async sumEntryTotals(
    registerId: string,
    client?: PoolClient,
  ): Promise<{
    totalEmployees: number;
    totalAdvance: number;
    totalSalaryNetPay: number;
    totalPayable: number;
  }> {
    const q = this.runner(client);
    const { rows } = await q<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS total_employees,
              COALESCE(SUM(advance_amount),0) AS total_advance,
              COALESCE(SUM(salary_net_pay),0) AS total_salary_net_pay,
              COALESCE(SUM(payable_amount),0) AS total_payable
       FROM employee_advance_entries WHERE advance_register_id = $1::uuid`,
      [registerId],
    );
    const s = rows[0] ?? {};
    return {
      totalEmployees: Number(s.total_employees ?? 0),
      totalAdvance: toNumber(s.total_advance as string),
      totalSalaryNetPay: toNumber(s.total_salary_net_pay as string),
      totalPayable: toNumber(s.total_payable as string),
    };
  }

  async setStatus(
    id: string,
    status: EmployeeAdvanceStatus,
    user: string,
    extras?: { finalize?: boolean; reopen?: boolean },
  ): Promise<void> {
    await query(
      `UPDATE employee_advance_registers SET
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

  async exportExcel(id: string): Promise<Buffer> {
    const detail = await this.findById(id);
    if (!detail) throw new NotFoundError('Employee advance register', id);
    return buildExcelBuffer(
      'Employee Advances',
      [...EXPORT_HEADERS],
      this.buildExportDataRows(detail),
    );
  }

  async exportPdf(id: string): Promise<Buffer> {
    const detail = await this.findById(id);
    if (!detail) throw new NotFoundError('Employee advance register', id);
    const period = `${String(detail.month).padStart(2, '0')}/${detail.year}`;
    const clientPart = detail.clientCode
      ? `${detail.clientName} (${detail.clientCode})`
      : detail.clientName;
    return buildPdfTableBuffer({
      title: 'Employee Advances',
      subtitle: `${clientPart} · ${period}`,
      headers: [...EXPORT_HEADERS],
      rows: this.buildExportDataRows(detail),
      landscape: true,
    });
  }

  withTransaction = withTransaction;

  private runner(client?: PoolClient): QueryRunner {
    if (!client) return query;
    return ((text: string, params?: unknown[]) => client.query(text, params)) as QueryRunner;
  }

  private async loadPaymentsByEntryIds(
    entryIds: string[],
  ): Promise<Map<string, EmployeeAdvancePayment[]>> {
    const map = new Map<string, EmployeeAdvancePayment[]>();
    if (!entryIds.length) return map;
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM employee_advance_payments
       WHERE entry_id = ANY($1::uuid[])
       ORDER BY paid_on ASC, created_at ASC`,
      [entryIds],
    );
    for (const r of rows) {
      const payment = this.mapPayment(r);
      const list = map.get(payment.entryId) ?? [];
      list.push(payment);
      map.set(payment.entryId, list);
    }
    return map;
  }

  private buildExportDataRows(
    detail: EmployeeAdvanceDetail,
  ): Array<Array<string | number | null | undefined>> {
    const rows: Array<Array<string | number | null | undefined>> = [];
    for (const e of detail.employees) {
      if (!e.payments.length) {
        rows.push([
          e.softCode ?? '',
          e.employeeCode,
          e.employeeName,
          e.designation ?? '',
          '',
          '',
          '',
          e.advanceAmount,
          e.salaryNetPay ?? '',
          e.payableAmount ?? '',
        ]);
        continue;
      }
      for (const p of e.payments) {
        rows.push([
          e.softCode ?? '',
          e.employeeCode,
          e.employeeName,
          e.designation ?? '',
          p.paidOn,
          p.amount,
          p.notes ?? '',
          e.advanceAmount,
          e.salaryNetPay ?? '',
          e.payableAmount ?? '',
        ]);
      }
    }
    return rows;
  }

  private mapListItem(r: Record<string, unknown>): EmployeeAdvanceListItem {
    return {
      id: String(r.id),
      clientId: String(r.client_id),
      clientName: String(r.company_name),
      clientCode: r.client_code ? String(r.client_code) : null,
      month: Number(r.month),
      year: Number(r.year),
      status: String(r.status) as EmployeeAdvanceStatus,
      runNumber: Number(r.run_number),
      totalEmployees: Number(r.total_employees ?? 0),
      totalAdvance: toNumber(r.total_advance as string),
      totalSalaryNetPay: toNumber(r.total_salary_net_pay as string),
      totalPayable: toNumber(r.total_payable as string),
      salaryRegisterId: r.salary_register_id ? String(r.salary_register_id) : null,
      generatedAt: formatDateTime(r.generated_at as Date)!,
      generatedBy: String(r.generated_by ?? ''),
      finalizedAt: formatDateTime(r.finalized_at as Date | null),
      finalizedBy: r.finalized_by ? String(r.finalized_by) : null,
    };
  }

  private mapPayment(r: Record<string, unknown>): EmployeeAdvancePayment {
    return {
      id: String(r.id),
      entryId: String(r.entry_id),
      paidOn: formatDate(r.paid_on as Date | string)!,
      amount: toNumber(r.amount as string),
      notes: r.notes ? String(r.notes) : null,
      createdAt: formatDateTime(r.created_at as Date)!,
      createdBy: String(r.created_by ?? ''),
    };
  }

  private mapEntry(
    r: Record<string, unknown>,
    payments: EmployeeAdvancePayment[],
  ): EmployeeAdvanceEntry {
    return {
      id: String(r.id),
      advanceRegisterId: String(r.advance_register_id),
      employeeId: String(r.employee_id),
      softCode: r.soft_code ? String(r.soft_code) : null,
      employeeCode: String(r.employee_code),
      employeeName: String(r.employee_name),
      designation: r.designation ? String(r.designation) : null,
      advanceAmount: toNumber(r.advance_amount as string),
      paymentCount: Number(r.payment_count ?? payments.length),
      notes: r.notes ? String(r.notes) : null,
      salaryNetPay: r.salary_net_pay == null ? null : toNumber(r.salary_net_pay as string),
      payableAmount: r.payable_amount == null ? null : toNumber(r.payable_amount as string),
      payments,
    };
  }

  private mapDetail(
    r: Record<string, unknown>,
    employees: EmployeeAdvanceEntry[],
  ): EmployeeAdvanceDetail {
    return {
      id: String(r.id),
      clientId: String(r.client_id),
      clientName: String(r.company_name),
      clientCode: r.client_code ? String(r.client_code) : null,
      month: Number(r.month),
      year: Number(r.year),
      status: String(r.status) as EmployeeAdvanceStatus,
      runNumber: Number(r.run_number),
      salaryRegisterId: r.salary_register_id ? String(r.salary_register_id) : null,
      summary: {
        totalEmployees: Number(r.total_employees ?? employees.length),
        totalAdvance: toNumber(r.total_advance as string),
        totalSalaryNetPay: toNumber(r.total_salary_net_pay as string),
        totalPayable: toNumber(r.total_payable as string),
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

export const employeeAdvancesRepository = new EmployeeAdvancesRepository();
