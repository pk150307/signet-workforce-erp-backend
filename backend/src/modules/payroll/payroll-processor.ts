import { query } from '../../database/pool';
import { AppError } from '../../common/errors';
import { AttendanceStatus, EmployeeStatus, LeaveStatus, PayrollStatus } from '../../types/enums';
import { daysInMonth, roundOff, toNumber } from '../../utils/formatters';
import {
  proRateGradeCompensation,
} from '../designation-grade/designation-grade.compensation';
import {
  EMPLOYEE_PAY_GRADE_JOINS,
  EMPLOYEE_PAY_GRADE_SELECT,
  resolvePayGradeFromRow,
} from '../designation-grade/designation-grade.resolver';
import {
  computeEmployeeEsi,
  computeEmployeeLwf,
  computeEmployeePf,
  computeEsiGrossEarned,
  computeStatutoryGrossEarned,
  computeTotalGrossEarned,
  resolveStatutoryConfig,
} from '../statutory/statutory.calculation';
import { resolvePayrollRunId } from '../../utils/payroll-run';

export interface ProcessPayrollOptions {
  month: number;
  year: number;
  employeeIds?: string[];
  clientId?: string;
  departmentId?: string;
  createdBy: string;
}

export async function processPayrollForPeriod(options: ProcessPayrollOptions): Promise<string> {
  const { month, year, createdBy } = options;
  const { id: payrollRunId } = await resolvePayrollRunId(month, year, createdBy);

  let employeeSql = `
    SELECT e.id,
           ${EMPLOYEE_PAY_GRADE_SELECT},
           esd.is_pf_applicable AS esd_is_pf_applicable,
           esd.is_esi_applicable AS esd_is_esi_applicable,
           esd.employee_pf_percentage AS esd_employee_pf_percentage,
           esd.employee_esi_percentage AS esd_employee_esi_percentage
    FROM employees e
    LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
    ${EMPLOYEE_PAY_GRADE_JOINS}
    LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id AND NOT esd.is_deleted
    LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
    WHERE NOT e.is_deleted AND e.status = $1`;
  const employeeParams: unknown[] = [EmployeeStatus.Active];
  let paramIndex = 2;

  if (options.employeeIds?.length) {
    employeeSql += ` AND e.id = ANY($${paramIndex}::uuid[])`;
    employeeParams.push(options.employeeIds);
    paramIndex++;
  }

  if (options.clientId) {
    employeeSql += ` AND s.client_id = $${paramIndex}::uuid`;
    employeeParams.push(options.clientId);
    paramIndex++;
  }

  if (options.departmentId) {
    employeeSql += ` AND COALESCE(ed.department_id, e.department_id) = $${paramIndex}::uuid`;
    employeeParams.push(options.departmentId);
    paramIndex++;
  }

  const { rows: employees } = await query<Record<string, unknown>>(employeeSql, employeeParams);

  if (employees.length === 0) {
    throw new AppError(404, 'No active employees found for the selected filters.');
  }

  const calendarDays = daysInMonth(year, month);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndDate = new Date(year, month, 0);
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;

  let totalGross = 0;
  let totalDeductions = 0;

  for (const employee of employees) {
    const employeeId = String(employee.id);
    const payGrade = resolvePayGradeFromRow(employee);
    const gradeComp = payGrade.gradeComp;
    const basicSalary = gradeComp?.basicSalary ?? toNumber(employee.employment_basic_salary as string);
    const grossSalary = payGrade.monthlyGross;

    const presentResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM attendances
       WHERE employee_id = $1 AND attendance_date BETWEEN $2 AND $3
       AND status IN ($4, $5) AND NOT is_deleted`,
      [employeeId, monthStart, monthEnd, AttendanceStatus.Present, AttendanceStatus.HalfDay],
    );
    const presentDays = parseInt(presentResult.rows[0].count, 10);

    const leaveResult = await query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(number_of_days), 0) AS sum FROM leave_requests
       WHERE employee_id = $1 AND status = $2
       AND from_date >= $3 AND to_date <= $4 AND NOT is_deleted`,
      [employeeId, LeaveStatus.Approved, monthStart, monthEnd],
    );
    const leaveDays = parseFloat(leaveResult.rows[0].sum ?? '0');
    const absentDays = Math.max(0, calendarDays - presentDays - leaveDays);

    const registerExtrasResult = await query<{
      overtime_amount: string;
      night_allowance: string;
      punctuality_award: string;
    }>(
      `SELECT COALESCE(SUM(aro.overtime_hours), 0) AS overtime_amount,
              COALESCE(SUM(aro.night_allowance), 0) AS night_allowance,
              COALESCE(SUM(aro.punctuality_award), 0) AS punctuality_award
       FROM attendance_register_employee_overtime aro
       INNER JOIN attendance_registers ar ON ar.id = aro.register_id
       WHERE aro.employee_id = $1 AND ar.month = $2 AND ar.year = $3`,
      [employeeId, month, year],
    );
    const overtimePay = roundOff(parseFloat(registerExtrasResult.rows[0]?.overtime_amount ?? '0'));
    const nightAllowance = roundOff(parseFloat(registerExtrasResult.rows[0]?.night_allowance ?? '0'));
    const punctualityAward = roundOff(parseFloat(registerExtrasResult.rows[0]?.punctuality_award ?? '0'));

    let basicEarned: number;
    let hraEarned: number;
    let specialAllowance: number;

    if (gradeComp) {
      const proRated = proRateGradeCompensation(gradeComp, calendarDays, presentDays);
      basicEarned = proRated.basicEarned;
      hraEarned = proRated.houseRentAllowanceEarned;
      specialAllowance = proRated.specialAllowanceEarned;
    } else {
      const perDaySalary = calendarDays > 0 ? basicSalary / calendarDays : 0;
      basicEarned = roundOff(perDaySalary * presentDays);
      hraEarned = roundOff((grossSalary - basicSalary) * 0.4 * (calendarDays > 0 ? presentDays / calendarDays : 0));
      specialAllowance = roundOff((grossSalary - basicSalary) * 0.6 * (calendarDays > 0 ? presentDays / calendarDays : 0));
    }

    const statutoryConfig = resolveStatutoryConfig(
      payGrade.statutorySource,
      {
        is_pf_applicable: employee.esd_is_pf_applicable as boolean | null,
        is_esi_applicable: employee.esd_is_esi_applicable as boolean | null,
        employee_pf_percentage: employee.esd_employee_pf_percentage as string | null,
        employee_esi_percentage: employee.esd_employee_esi_percentage as string | null,
      },
    );

    const totalGrossEarned = computeTotalGrossEarned(
      basicEarned,
      hraEarned,
      specialAllowance,
      nightAllowance,
      punctualityAward,
      overtimePay,
    );

    const esiGross = computeEsiGrossEarned(
      basicEarned,
      hraEarned,
      nightAllowance,
      overtimePay,
    );

    const lwfGross = computeStatutoryGrossEarned(
      basicEarned,
      hraEarned,
      nightAllowance,
      punctualityAward,
      overtimePay,
    );

    const pf = computeEmployeePf(basicEarned, statutoryConfig);
    const esi = computeEmployeeEsi(esiGross, grossSalary, statutoryConfig);
    const lwf = computeEmployeeLwf(lwfGross, statutoryConfig);

    const gross = totalGrossEarned;
    const deductions = roundOff(pf + esi + lwf);
    totalGross += gross;
    totalDeductions += deductions;

    await query(
      `INSERT INTO payroll_entries (
        employee_id, payroll_run_id, month, year, working_days, present_days,
        leave_days, absent_days, basic_salary, house_rent_allowance, special_allowance,
        night_allowance, punctuality_award,
        overtime_hours, overtime_pay, provident_fund, esi, lwf, professional_tax, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      ON CONFLICT (payroll_run_id, employee_id) DO UPDATE SET
        working_days = EXCLUDED.working_days, present_days = EXCLUDED.present_days,
        leave_days = EXCLUDED.leave_days, absent_days = EXCLUDED.absent_days,
        basic_salary = EXCLUDED.basic_salary, house_rent_allowance = EXCLUDED.house_rent_allowance,
        special_allowance = EXCLUDED.special_allowance,
        night_allowance = EXCLUDED.night_allowance,
        punctuality_award = EXCLUDED.punctuality_award,
        overtime_hours = EXCLUDED.overtime_hours, overtime_pay = EXCLUDED.overtime_pay,
        provident_fund = EXCLUDED.provident_fund,
        esi = EXCLUDED.esi, lwf = EXCLUDED.lwf, professional_tax = EXCLUDED.professional_tax,
        status = EXCLUDED.status, updated_at = NOW(), updated_by = EXCLUDED.created_by`,
      [
        employeeId,
        payrollRunId,
        month,
        year,
        calendarDays,
        presentDays,
        leaveDays,
        absentDays,
        roundOff(basicEarned),
        roundOff(hraEarned),
        roundOff(specialAllowance),
        nightAllowance,
        punctualityAward,
        0,
        overtimePay,
        pf,
        esi,
        lwf,
        0,
        PayrollStatus.Processing,
        createdBy,
      ],
    );
  }

  await query(
    `UPDATE payroll_runs SET status = $2, processed_date = NOW(), total_employees = $3,
     total_gross = $4, total_deductions = $5, total_net = $6, updated_at = NOW(), updated_by = $7
     WHERE id = $1`,
    [
      payrollRunId,
      PayrollStatus.Processing,
      employees.length,
      roundOff(totalGross),
      roundOff(totalDeductions),
      roundOff(totalGross - totalDeductions),
      createdBy,
    ],
  );

  return payrollRunId!;
}
