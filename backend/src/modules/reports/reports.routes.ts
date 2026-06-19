import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess, validate } from '../../common/response';
import { AttendanceStatus, InvoiceStatus } from '../../types/enums';
import { toNumber } from '../../utils/formatters';

const router = Router();
router.use(authenticate);

router.get(
  '/attendance',
  validate([
    query('fromDate').optional().isISO8601(),
    query('toDate').optional().isISO8601(),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();
      const fromDate =
        (req.query.fromDate as string) ||
        `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const toDate =
        (req.query.toDate as string) ||
        `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const summary = await dbQuery<{ status: number; count: string }>(
        `SELECT status, COUNT(*) AS count FROM attendances
         WHERE attendance_date BETWEEN $1 AND $2 AND NOT is_deleted GROUP BY status`,
        [fromDate, toDate],
      );

      const byStatus = Object.fromEntries(summary.rows.map((r) => [r.status, parseInt(r.count, 10)]));

      const { rows: daily } = await dbQuery<Record<string, unknown>>(
        `SELECT attendance_date, status, COUNT(*) AS count FROM attendances
         WHERE attendance_date BETWEEN $1 AND $2 AND NOT is_deleted
         GROUP BY attendance_date, status ORDER BY attendance_date`,
        [fromDate, toDate],
      );

      sendSuccess(res, {
        period: { fromDate, toDate, month, year },
        summary: {
          present: byStatus[AttendanceStatus.Present] ?? 0,
          absent: byStatus[AttendanceStatus.Absent] ?? 0,
          halfDay: byStatus[AttendanceStatus.HalfDay] ?? 0,
          onLeave: byStatus[AttendanceStatus.OnLeave] ?? 0,
          late: byStatus[AttendanceStatus.Late] ?? 0,
          holiday: byStatus[AttendanceStatus.Holiday] ?? 0,
          weekOff: byStatus[AttendanceStatus.WeekOff] ?? 0,
          total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        },
        dailyBreakdown: daily.map((r) => ({
          date: String(r.attendance_date).split('T')[0],
          status: Number(r.status),
          count: parseInt(String(r.count), 10),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/payroll',
  validate([
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();

      const { rows: runs } = await dbQuery<Record<string, unknown>>(
        `SELECT id, run_code, status, total_employees, total_gross, total_deductions, total_net, processed_date
         FROM payroll_runs WHERE month = $1 AND year = $2 AND NOT is_deleted`,
        [month, year],
      );

      const { rows: entries } = await dbQuery<Record<string, unknown>>(
        `SELECT pe.basic_salary, pe.house_rent_allowance, pe.special_allowance,
                pe.provident_fund, pe.esi, pe.professional_tax,
                e.employee_code, e.first_name, e.last_name
         FROM payroll_entries pe
         INNER JOIN employees e ON e.id = pe.employee_id
         WHERE pe.month = $1 AND pe.year = $2 AND NOT pe.is_deleted
         ORDER BY e.employee_code`,
        [month, year],
      );

      interface PayrollTotals {
        gross: number;
        pf: number;
        esi: number;
        pt: number;
      }

      const totals = entries.reduce<PayrollTotals>(
        (acc, r) => ({
          gross:
            acc.gross +
            toNumber(r.basic_salary as string) +
            toNumber(r.house_rent_allowance as string) +
            toNumber(r.special_allowance as string),
          pf: acc.pf + toNumber(r.provident_fund as string),
          esi: acc.esi + toNumber(r.esi as string),
          pt: acc.pt + toNumber(r.professional_tax as string),
        }),
        { gross: 0, pf: 0, esi: 0, pt: 0 },
      );

      sendSuccess(res, {
        month,
        year,
        payrollRun: runs[0]
          ? {
              id: String(runs[0].id),
              runCode: String(runs[0].run_code),
              status: Number(runs[0].status),
              totalEmployees: Number(runs[0].total_employees),
              totalGross: toNumber(runs[0].total_gross as string),
              totalDeductions: toNumber(runs[0].total_deductions as string),
              totalNet: toNumber(runs[0].total_net as string),
              processedDate: runs[0].processed_date
                ? new Date(String(runs[0].processed_date)).toISOString()
                : null,
            }
          : null,
        totals: {
          ...totals,
          net: totals.gross - totals.pf - totals.esi - totals.pt,
          employeeCount: entries.length,
        },
        employees: entries.map((r) => ({
          employeeCode: String(r.employee_code),
          employeeName: `${r.first_name} ${r.last_name}`,
          basicSalary: toNumber(r.basic_salary as string),
          hra: toNumber(r.house_rent_allowance as string),
          specialAllowance: toNumber(r.special_allowance as string),
          pf: toNumber(r.provident_fund as string),
          esi: toNumber(r.esi as string),
          professionalTax: toNumber(r.professional_tax as string),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/billing',
  validate([
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      const year = Number(req.query.year) || new Date().getFullYear();

      const { rows: invoices } = await dbQuery<Record<string, unknown>>(
        `SELECT i.invoice_number, i.total_amount, i.paid_amount, i.status, c.company_name
         FROM invoices i INNER JOIN clients c ON c.id = i.client_id
         WHERE i.month = $1 AND i.year = $2 AND NOT i.is_deleted
         ORDER BY i.invoice_date DESC`,
        [month, year],
      );

      const totalRevenue = invoices.reduce((s, r) => s + toNumber(r.total_amount as string), 0);
      const totalCollected = invoices.reduce((s, r) => s + toNumber(r.paid_amount as string), 0);
      const outstanding = totalRevenue - totalCollected;
      const overdue = invoices.filter((r) => Number(r.status) === InvoiceStatus.Overdue).length;

      sendSuccess(res, {
        month,
        year,
        summary: {
          invoiceCount: invoices.length,
          totalRevenue,
          totalCollected,
          outstanding,
          overdueCount: overdue,
          collectionRate: totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0,
        },
        invoices: invoices.map((r) => ({
          invoiceNumber: String(r.invoice_number),
          clientName: String(r.company_name),
          totalAmount: toNumber(r.total_amount as string),
          paidAmount: toNumber(r.paid_amount as string),
          balanceAmount: toNumber(r.total_amount as string) - toNumber(r.paid_amount as string),
          status: Number(r.status),
        })),
      });
    } catch (e) {
      next(e);
    }
  },
);

export default router;
