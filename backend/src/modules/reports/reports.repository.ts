import { query } from '../../database/pool';
import { AttendanceStatus, InvoiceStatus } from '../../types/enums';
import { EmployeeLifecycleStatus } from '../employee/employee.constants';
import { toNumber } from '../../utils/formatters';
import {
  AttendanceReport,
  EmployeeReport,
  InvoiceReport,
  PayrollReport,
  ReportFilter,
  ReportPeriod,
  ReportRow,
} from './reports.types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const EXCLUDED_INVOICE_STATUSES = [
  InvoiceStatus.Draft,
  InvoiceStatus.Cancelled,
  InvoiceStatus.Archived,
];

export function resolveReportBounds(filter: ReportFilter): {
  month?: number;
  year?: number;
  fromDate?: string;
  toDate?: string;
} {
  let { month, year } = filter;
  if (month && !year) year = new Date().getFullYear();
  if (month && year) {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      month,
      year,
      fromDate: `${year}-${pad(month)}-01`,
      toDate: `${year}-${pad(month)}-${pad(lastDay)}`,
    };
  }
  if (year) {
    return {
      year,
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    };
  }
  return {};
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function periodLabel(bounds: { month?: number; year?: number }, clientName: string | null): string {
  const period = bounds.month && bounds.year
    ? `${MONTH_NAMES[bounds.month - 1]} ${bounds.year}`
    : bounds.year
      ? `Year ${bounds.year}`
      : 'All periods';
  return `${period} · ${clientName ?? 'All clients'}`;
}

function employeeClientJoin(): string {
  return `LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
       LEFT JOIN clients c ON c.id = s.client_id AND NOT c.is_deleted`;
}

export class ReportsRepository {
  async resolveClientName(clientId?: string): Promise<string | null> {
    if (!clientId) return null;
    const { rows } = await query<{ company_name: string }>(
      `SELECT company_name FROM clients WHERE id = $1::uuid AND NOT is_deleted`,
      [clientId],
    );
    return rows[0]?.company_name ?? null;
  }

  async buildPeriod(filter: ReportFilter): Promise<ReportPeriod> {
    const bounds = resolveReportBounds(filter);
    const clientName = await this.resolveClientName(filter.clientId);
    return {
      label: periodLabel(bounds, clientName),
      month: bounds.month ?? null,
      year: bounds.year ?? null,
      fromDate: bounds.fromDate ?? null,
      toDate: bounds.toDate ?? null,
      clientId: filter.clientId ?? null,
      clientName,
    };
  }

  async getAttendanceReport(filter: ReportFilter): Promise<AttendanceReport> {
    const period = await this.buildPeriod(filter);
    const params: unknown[] = [];
    const conditions: string[] = ['NOT a.is_deleted'];

    if (period.fromDate) {
      params.push(period.fromDate);
      conditions.push(`a.attendance_date >= $${params.length}::date`);
    }
    if (period.toDate) {
      params.push(period.toDate);
      conditions.push(`a.attendance_date <= $${params.length}::date`);
    }
    if (filter.clientId) {
      params.push(filter.clientId);
      conditions.push(`s.client_id = $${params.length}::uuid`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [summaryResult, clientResult] = await Promise.all([
      query<{ status: number; count: string }>(
        `SELECT a.status, COUNT(*) AS count
         FROM attendances a
         INNER JOIN employees e ON e.id = a.employee_id AND NOT e.is_deleted
         ${employeeClientJoin()}
         ${where}
         GROUP BY a.status`,
        params,
      ),
      query<{ client_name: string; present: string; total: string }>(
        `SELECT COALESCE(c.company_name, 'Unassigned') AS client_name,
                COUNT(*) FILTER (WHERE a.status = ${AttendanceStatus.Present}) AS present,
                COUNT(*) AS total
         FROM attendances a
         INNER JOIN employees e ON e.id = a.employee_id AND NOT e.is_deleted
         ${employeeClientJoin()}
         ${where}
         GROUP BY c.id, c.company_name
         ORDER BY total DESC`,
        params,
      ),
    ]);

    const byStatus = Object.fromEntries(
      summaryResult.rows.map((row) => [row.status, parseInt(row.count, 10)]),
    );
    const present = byStatus[AttendanceStatus.Present] ?? 0;
    const absent = byStatus[AttendanceStatus.Absent] ?? 0;
    const onLeave = byStatus[AttendanceStatus.OnLeave] ?? 0;
    const late = byStatus[AttendanceStatus.Late] ?? 0;
    const halfDay = byStatus[AttendanceStatus.HalfDay] ?? 0;
    const holiday = byStatus[AttendanceStatus.Holiday] ?? 0;
    const weekOff = byStatus[AttendanceStatus.WeekOff] ?? 0;
    const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

    let rows: ReportRow[] = clientResult.rows.map((row) => {
      const clientTotal = parseInt(row.total, 10);
      const clientPresent = parseInt(row.present, 10);
      const rate = clientTotal ? Math.round((clientPresent / clientTotal) * 100) : 0;
      return { label: row.client_name, value: `${rate}% present` };
    });

    if (!rows.length) {
      rows = await this.attendanceRegisterFallback(filter, period);
    }

    return {
      period,
      summary: { present, absent, onLeave, late, halfDay, holiday, weekOff, total },
      rows,
    };
  }

  private async attendanceRegisterFallback(
    filter: ReportFilter,
    period: ReportPeriod,
  ): Promise<ReportRow[]> {
    const params: unknown[] = [];
    const conditions: string[] = ['TRUE'];
    if (period.month) {
      params.push(period.month);
      conditions.push(`r.month = $${params.length}`);
    }
    if (period.year) {
      params.push(period.year);
      conditions.push(`r.year = $${params.length}`);
    }
    if (filter.clientId) {
      params.push(filter.clientId);
      conditions.push(`r.client_id = $${params.length}::uuid`);
    }

    const { rows } = await query<{ client_name: string; present_days: string; employees: string }>(
      `SELECT c.company_name AS client_name,
              COALESCE(SUM(o.present_days), 0) AS present_days,
              COUNT(DISTINCT o.employee_id) AS employees
       FROM attendance_registers r
       INNER JOIN clients c ON c.id = r.client_id AND NOT c.is_deleted
       LEFT JOIN attendance_register_employee_overtime o ON o.register_id = r.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY c.id, c.company_name
       ORDER BY present_days DESC`,
      params,
    );

    return rows.map((row) => ({
      label: row.client_name,
      value: `${toNumber(row.present_days)} present days · ${parseInt(row.employees, 10)} employees`,
    }));
  }

  async getPayrollReport(filter: ReportFilter): Promise<PayrollReport> {
    const period = await this.buildPeriod(filter);
    const params: unknown[] = [];
    const conditions: string[] = ['TRUE'];
    if (period.month) {
      params.push(period.month);
      conditions.push(`sr.month = $${params.length}`);
    }
    if (period.year) {
      params.push(period.year);
      conditions.push(`sr.year = $${params.length}`);
    }
    if (filter.clientId) {
      params.push(filter.clientId);
      conditions.push(`sr.client_id = $${params.length}::uuid`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [totalsResult, clientResult] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT
            COALESCE(SUM(sr.total_gross), 0) AS gross,
            COALESCE(SUM(sr.total_deductions), 0) AS deductions,
            COALESCE(SUM(sr.total_net_pay), 0) AS net,
            COALESCE(SUM(sr.total_employees), 0) AS employees
         FROM salary_registers sr
         ${where}`,
        params,
      ),
      query<{ client_name: string; net: string; employees: string }>(
        `SELECT c.company_name AS client_name,
                COALESCE(SUM(sr.total_net_pay), 0) AS net,
                COALESCE(SUM(sr.total_employees), 0) AS employees
         FROM salary_registers sr
         INNER JOIN clients c ON c.id = sr.client_id AND NOT c.is_deleted
         ${where}
         GROUP BY c.id, c.company_name
         ORDER BY net DESC`,
        params,
      ),
    ]);

    const totals = totalsResult.rows[0] ?? {};
    return {
      period,
      summary: {
        grossPay: toNumber(totals.gross as string),
        deductions: toNumber(totals.deductions as string),
        netPay: toNumber(totals.net as string),
        employeeCount: Number(totals.employees ?? 0),
      },
      rows: clientResult.rows.map((row) => ({
        label: row.client_name,
        value: formatInr(toNumber(row.net)),
        trend: Number(row.employees),
      })),
    };
  }

  async getInvoiceReport(filter: ReportFilter): Promise<InvoiceReport> {
    const period = await this.buildPeriod(filter);
    const params: unknown[] = [...EXCLUDED_INVOICE_STATUSES];
    const conditions = [`NOT i.is_deleted`, `i.status NOT IN ($1, $2, $3)`];

    if (period.month) {
      params.push(period.month);
      conditions.push(`i.month = $${params.length}`);
    }
    if (period.year) {
      params.push(period.year);
      conditions.push(`i.year = $${params.length}`);
    }
    if (filter.clientId) {
      params.push(filter.clientId);
      conditions.push(`i.client_id = $${params.length}::uuid`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [totalsResult, clientResult] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT
            COUNT(*) AS invoice_count,
            COALESCE(SUM(i.total_amount), 0) AS billed,
            COALESCE(SUM(i.paid_amount), 0) AS collected
         FROM invoices i
         ${where}`,
        params,
      ),
      query<{ client_name: string; billed: string }>(
        `SELECT c.company_name AS client_name,
                COALESCE(SUM(i.total_amount), 0) AS billed
         FROM invoices i
         INNER JOIN clients c ON c.id = i.client_id AND NOT c.is_deleted
         ${where}
         GROUP BY c.id, c.company_name
         ORDER BY billed DESC`,
        params,
      ),
    ]);

    const totals = totalsResult.rows[0] ?? {};
    const billed = toNumber(totals.billed as string);
    const collected = toNumber(totals.collected as string);
    return {
      period,
      summary: {
        totalBilled: billed,
        collected,
        outstanding: billed - collected,
        invoiceCount: Number(totals.invoice_count ?? 0),
      },
      rows: clientResult.rows.map((row) => ({
        label: row.client_name,
        value: formatInr(toNumber(row.billed)),
      })),
    };
  }

  async getEmployeeReport(filter: ReportFilter): Promise<EmployeeReport> {
    const period = await this.buildPeriod(filter);
    const params: unknown[] = [];
    const clientCondition = filter.clientId
      ? (() => {
          params.push(filter.clientId);
          return `AND s.client_id = $${params.length}::uuid`;
        })()
      : '';

    const dateParams = [...params];
    let joinerCondition = '';
    let exitCondition = '';
    if (period.fromDate && period.toDate) {
      dateParams.push(period.fromDate);
      const fromIdx = dateParams.length;
      dateParams.push(period.toDate);
      const toIdx = dateParams.length;
      joinerCondition = `AND COALESCE(ed.joining_date, e.joining_date) BETWEEN $${fromIdx}::date AND $${toIdx}::date`;
      exitCondition = `AND e.relieving_date BETWEEN $${fromIdx}::date AND $${toIdx}::date`;
    }

    const [statsResult, deptResult] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT
            COUNT(*) FILTER (WHERE NOT e.is_deleted) AS total,
            COUNT(*) FILTER (WHERE NOT e.is_deleted AND e.status IN (${EmployeeLifecycleStatus.Active}, ${EmployeeLifecycleStatus.Rejoined})) AS active,
            COUNT(*) FILTER (WHERE NOT e.is_deleted ${joinerCondition}) AS joiners,
            COUNT(*) FILTER (WHERE NOT e.is_deleted AND e.status = ${EmployeeLifecycleStatus.Left} ${exitCondition}) AS exits
         FROM employees e
         ${employeeClientJoin()}
         WHERE NOT e.is_deleted ${clientCondition}`,
        dateParams,
      ),
      query<{ department: string; count: string }>(
        `SELECT d.name AS department, COUNT(*) AS count
         FROM employees e
         ${employeeClientJoin()}
         INNER JOIN departments d ON d.id = COALESCE(ed.department_id, e.department_id)
         WHERE NOT e.is_deleted
           AND e.status IN (${EmployeeLifecycleStatus.Active}, ${EmployeeLifecycleStatus.Rejoined})
           ${clientCondition}
         GROUP BY d.name
         ORDER BY count DESC`,
        params,
      ),
    ]);

    const stats = statsResult.rows[0] ?? {};
    return {
      period,
      summary: {
        totalEmployees: Number(stats.total ?? 0),
        active: Number(stats.active ?? 0),
        newJoiners: Number(stats.joiners ?? 0),
        exits: Number(stats.exits ?? 0),
      },
      rows: deptResult.rows.map((row) => ({
        label: row.department,
        value: parseInt(row.count, 10),
      })),
    };
  }
}

function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const reportsRepository = new ReportsRepository();
