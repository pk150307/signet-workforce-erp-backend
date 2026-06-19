import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendId, sendSuccess, validate } from '../../common/response';
import { EmployeeStatus, AttendanceStatus, LeaveStatus, PayrollStatus } from '../../types/enums';
import { countWorkingDays, monthName, round2, toNumber } from '../../utils/formatters';
import { AppError } from '../../common/errors';
import payslipRoutes from './payslip.routes';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await dbQuery<Record<string, unknown>>(
      `SELECT pr.id, pr.run_code, pr.month, pr.year, pr.status, pr.total_employees,
              pr.total_gross, pr.total_net, pr.processed_date
       FROM payroll_runs pr WHERE NOT pr.is_deleted ORDER BY pr.year DESC, pr.month DESC`,
    );

    const items = rows.map((r) => ({
      id: String(r.id),
      runCode: String(r.run_code),
      monthName: monthName(Number(r.month), Number(r.year)),
      status: Number(r.status) as PayrollStatus,
      totalEmployees: Number(r.total_employees),
      totalGross: toNumber(r.total_gross as string),
      totalNet: toNumber(r.total_net as string),
      processedDate: r.processed_date ? new Date(String(r.processed_date)).toISOString() : null,
    }));

    sendSuccess(res, items);
  } catch (e) {
    next(e);
  }
});

router.post(
  '/process',
  validate([
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
    body('employeeIds').optional().isArray(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const month = Number(req.body.month);
      const year = Number(req.body.year);
      const runCode = `PR-${year}${String(month).padStart(2, '0')}`;

      const { rows: existingRows } = await dbQuery<{ id: string; status: number }>(
        `SELECT id, status FROM payroll_runs WHERE month = $1 AND year = $2 AND NOT is_deleted`,
        [month, year],
      );

      let payrollRunId = existingRows[0]?.id;
      if (existingRows[0] && existingRows[0].status !== PayrollStatus.Draft) {
        throw new AppError(400, `Payroll for ${month}/${year} has already been processed.`);
      }

      if (!payrollRunId) {
        const { rows } = await dbQuery<{ id: string }>(
          `INSERT INTO payroll_runs (run_code, month, year, status, created_by)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [runCode, month, year, PayrollStatus.Draft, req.user?.username ?? 'System'],
        );
        payrollRunId = rows[0].id;
      }

      let employeeSql = `SELECT id, basic_salary, gross_salary FROM employees
                         WHERE NOT is_deleted AND status = $1`;
      const employeeParams: unknown[] = [EmployeeStatus.Active];

      if (req.body.employeeIds?.length) {
        employeeSql += ` AND id = ANY($2::uuid[])`;
        employeeParams.push(req.body.employeeIds);
      }

      const { rows: employees } = await dbQuery<{
        id: string;
        basic_salary: string;
        gross_salary: string;
      }>(employeeSql, employeeParams);

      const workingDays = countWorkingDays(year, month);
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthEndDate = new Date(year, month, 0);
      const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;

      let totalGross = 0;
      let totalDeductions = 0;

      for (const employee of employees) {
        const basicSalary = toNumber(employee.basic_salary);
        const grossSalary = toNumber(employee.gross_salary);

        const presentResult = await dbQuery<{ count: string }>(
          `SELECT COUNT(*) AS count FROM attendances
           WHERE employee_id = $1 AND attendance_date BETWEEN $2 AND $3
           AND status IN ($4, $5) AND NOT is_deleted`,
          [employee.id, monthStart, monthEnd, AttendanceStatus.Present, AttendanceStatus.HalfDay],
        );
        const presentDays = parseInt(presentResult.rows[0].count, 10);

        const leaveResult = await dbQuery<{ sum: string | null }>(
          `SELECT COALESCE(SUM(number_of_days), 0) AS sum FROM leave_requests
           WHERE employee_id = $1 AND status = $2
           AND from_date >= $3 AND to_date <= $4 AND NOT is_deleted`,
          [employee.id, LeaveStatus.Approved, monthStart, monthEnd],
        );
        const leaveDays = parseFloat(leaveResult.rows[0].sum ?? '0');
        const absentDays = Math.max(0, workingDays - presentDays - leaveDays);

        const perDaySalary = basicSalary / workingDays;
        const basicEarned = perDaySalary * presentDays;
        const hraEarned = (grossSalary - basicSalary) * 0.4 * (presentDays / workingDays);
        const specialAllowance = (grossSalary - basicSalary) * 0.6 * (presentDays / workingDays);
        const pf = basicEarned * 0.12;
        const esi = grossSalary <= 21000 ? basicEarned * 0.0075 : 0;
        const pt = basicEarned > 15000 ? 200 : 150;

        const gross = round2(basicEarned + hraEarned + specialAllowance);
        const deductions = round2(pf + esi + pt);
        totalGross += gross;
        totalDeductions += deductions;

        await dbQuery(
          `INSERT INTO payroll_entries (
            employee_id, payroll_run_id, month, year, working_days, present_days,
            leave_days, absent_days, basic_salary, house_rent_allowance, special_allowance,
            provident_fund, esi, professional_tax, status, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT (payroll_run_id, employee_id) DO UPDATE SET
            working_days = EXCLUDED.working_days, present_days = EXCLUDED.present_days,
            leave_days = EXCLUDED.leave_days, absent_days = EXCLUDED.absent_days,
            basic_salary = EXCLUDED.basic_salary, house_rent_allowance = EXCLUDED.house_rent_allowance,
            special_allowance = EXCLUDED.special_allowance, provident_fund = EXCLUDED.provident_fund,
            esi = EXCLUDED.esi, professional_tax = EXCLUDED.professional_tax,
            status = EXCLUDED.status, updated_at = NOW(), updated_by = EXCLUDED.created_by`,
          [
            employee.id,
            payrollRunId,
            month,
            year,
            workingDays,
            presentDays,
            leaveDays,
            absentDays,
            round2(basicEarned),
            round2(hraEarned),
            round2(specialAllowance),
            round2(pf),
            round2(esi),
            pt,
            PayrollStatus.Processing,
            req.user?.username ?? 'System',
          ],
        );
      }

      await dbQuery(
        `UPDATE payroll_runs SET status = $2, processed_date = NOW(), total_employees = $3,
         total_gross = $4, total_deductions = $5, total_net = $6, updated_at = NOW(), updated_by = $7
         WHERE id = $1`,
        [
          payrollRunId,
          PayrollStatus.Processing,
          employees.length,
          round2(totalGross),
          round2(totalDeductions),
          round2(totalGross - totalDeductions),
          req.user?.username ?? 'System',
        ],
      );

      sendId(res, payrollRunId!);
    } catch (e) {
      next(e);
    }
  },
);

router.use('/payslips', payslipRoutes);

export default router;
