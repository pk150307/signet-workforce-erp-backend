import { Router, Request, Response, NextFunction } from 'express';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../common/response';
import {
  EmployeeStatus,
  AttendanceStatus,
  LeaveStatus,
  InvoiceStatus,
} from '../../types/enums';
import { toNumber } from '../../utils/formatters';

const router = Router();
router.use(authenticate);

router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const counts = await dbQuery<{ label: string; value: string }>(
      `SELECT 'totalEmployees' AS label, COUNT(*)::text AS value FROM employees WHERE NOT is_deleted
       UNION ALL SELECT 'activeEmployees', COUNT(*)::text FROM employees WHERE NOT is_deleted AND status = $1
       UNION ALL SELECT 'totalClients', COUNT(*)::text FROM clients WHERE NOT is_deleted
       UNION ALL SELECT 'activeClients', COUNT(*)::text FROM clients WHERE NOT is_deleted AND is_active
       UNION ALL SELECT 'totalSites', COUNT(*)::text FROM sites WHERE NOT is_deleted
       UNION ALL SELECT 'todayPresent', COUNT(*)::text FROM attendances WHERE attendance_date = $2 AND status = $3 AND NOT is_deleted
       UNION ALL SELECT 'todayAbsent', COUNT(*)::text FROM attendances WHERE attendance_date = $2 AND status = $4 AND NOT is_deleted
       UNION ALL SELECT 'todayOnLeave', COUNT(*)::text FROM attendances WHERE attendance_date = $2 AND status = $5 AND NOT is_deleted
       UNION ALL SELECT 'pendingLeaveRequests', COUNT(*)::text FROM leave_requests WHERE status = $6 AND NOT is_deleted`,
      [
        EmployeeStatus.Active,
        today,
        AttendanceStatus.Present,
        AttendanceStatus.Absent,
        AttendanceStatus.OnLeave,
        LeaveStatus.Pending,
      ],
    );

    const statsMap = Object.fromEntries(counts.rows.map((r) => [r.label, parseInt(r.value, 10)]));

    const payrollResult = await dbQuery<{ sum: string | null }>(
      `SELECT COALESCE(SUM(basic_salary + house_rent_allowance + special_allowance), 0) AS sum
       FROM payroll_entries WHERE month = $1 AND year = $2 AND NOT is_deleted`,
      [currentMonth, currentYear],
    );

    const revenueResult = await dbQuery<{ sum: string | null }>(
      `SELECT COALESCE(SUM(total_amount), 0) AS sum FROM invoices
       WHERE month = $1 AND year = $2 AND NOT is_deleted`,
      [currentMonth, currentYear],
    );

    const outstandingResult = await dbQuery<{ sum: string | null }>(
      `SELECT COALESCE(SUM(total_amount - paid_amount), 0) AS sum FROM invoices
       WHERE NOT is_deleted AND status IN ($1, $2, $3)`,
      [InvoiceStatus.Sent, InvoiceStatus.Overdue, InvoiceStatus.PartiallyPaid],
    );

    const attendanceTrend = [];
    for (let d = 6; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split('T')[0];
      const label = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

      const dayStats = await dbQuery<{ status: number; count: string }>(
        `SELECT status, COUNT(*) AS count FROM attendances
         WHERE attendance_date = $1 AND NOT is_deleted GROUP BY status`,
        [dateStr],
      );

      const byStatus = Object.fromEntries(dayStats.rows.map((r) => [r.status, parseInt(r.count, 10)]));
      attendanceTrend.push({
        date: label,
        present: byStatus[AttendanceStatus.Present] ?? 0,
        absent: byStatus[AttendanceStatus.Absent] ?? 0,
        onLeave: byStatus[AttendanceStatus.OnLeave] ?? 0,
      });
    }

    const revenueTrend = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(currentYear, currentMonth - 1 - i, 1);
      const m = dt.getMonth() + 1;
      const y = dt.getFullYear();
      const label = dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const rev = await dbQuery<{ sum: string | null }>(
        `SELECT COALESCE(SUM(total_amount), 0) AS sum FROM invoices WHERE month = $1 AND year = $2 AND NOT is_deleted`,
        [m, y],
      );
      const cost = await dbQuery<{ sum: string | null }>(
        `SELECT COALESCE(SUM(basic_salary + house_rent_allowance + special_allowance), 0) AS sum
         FROM payroll_entries WHERE month = $1 AND year = $2 AND NOT is_deleted`,
        [m, y],
      );

      revenueTrend.push({
        month: label,
        revenue: toNumber(rev.rows[0].sum),
        payrollCost: toNumber(cost.rows[0].sum),
      });
    }

    sendSuccess(res, {
      totalEmployees: statsMap.totalEmployees ?? 0,
      activeEmployees: statsMap.activeEmployees ?? 0,
      totalClients: statsMap.totalClients ?? 0,
      activeClients: statsMap.activeClients ?? 0,
      totalSites: statsMap.totalSites ?? 0,
      todayPresent: statsMap.todayPresent ?? 0,
      todayAbsent: statsMap.todayAbsent ?? 0,
      todayOnLeave: statsMap.todayOnLeave ?? 0,
      pendingLeaveRequests: statsMap.pendingLeaveRequests ?? 0,
      currentMonthPayroll: toNumber(payrollResult.rows[0].sum),
      currentMonthRevenue: toNumber(revenueResult.rows[0].sum),
      outstandingInvoices: toNumber(outstandingResult.rows[0].sum),
      attendanceTrend,
      revenueTrend,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
