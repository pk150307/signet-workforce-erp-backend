import { daysInMonth, toNumber } from '../../utils/formatters';
import { proRateGradeCompensation } from '../designation-grade/designation-grade.compensation';
import { resolvePayGradeFromRow } from '../designation-grade/designation-grade.resolver';
import { resolveStatutoryConfig } from '../statutory/statutory.calculation';
import { attendanceExtrasFromRow } from './attendance-register.extras';
import { buildPayslipBreakdown, PayslipBuildResult } from './payslip.builder';

function resolvePayPeriod(row: Record<string, unknown>): { month: number; year: number } {
  const month = Number(row.month ?? row.payroll_month ?? 0);
  const year = Number(row.year ?? row.payroll_year ?? 0);
  return { month, year };
}

/**
 * Prefer frozen payroll_entry earned amounts when available.
 * Re-prorate from employee/grade rates only as a fallback (e.g. legacy rows).
 */
function resolveEarnedCompensation(
  row: Record<string, unknown>,
  payGrade: ReturnType<typeof resolvePayGradeFromRow>,
): { basicEarned: number; hraEarned: number; specialEarned: number } {
  const earnedBasic = toNumber(
    (row.earned_basic_salary ?? row.basic_salary) as string | number | undefined,
  );
  const earnedHra = toNumber(
    (row.earned_house_rent_allowance ?? row.house_rent_allowance) as string | number | undefined,
  );
  const earnedSpecial = toNumber(
    (row.earned_special_allowance ?? row.special_allowance) as string | number | undefined,
  );

  // payroll_entries always carry earned component columns after processing.
  const hasFrozenEarned =
    Object.prototype.hasOwnProperty.call(row, 'earned_basic_salary')
    || Object.prototype.hasOwnProperty.call(row, 'basic_salary');

  if (hasFrozenEarned && (earnedBasic > 0 || earnedHra > 0 || earnedSpecial > 0)) {
    return {
      basicEarned: earnedBasic,
      hraEarned: earnedHra,
      specialEarned: earnedSpecial,
    };
  }

  const { month, year } = resolvePayPeriod(row);
  const presentDays = toNumber(row.present_days as string | number | undefined);
  const calendarDays = month > 0 && year > 0 ? daysInMonth(year, month) : 0;

  if (payGrade.gradeComp && calendarDays > 0) {
    const proRated = proRateGradeCompensation(payGrade.gradeComp, calendarDays, presentDays);
    return {
      basicEarned: proRated.basicEarned,
      hraEarned: proRated.houseRentAllowanceEarned,
      specialEarned: proRated.specialAllowanceEarned,
    };
  }

  return {
    basicEarned: earnedBasic,
    hraEarned: earnedHra,
    specialEarned: earnedSpecial,
  };
}

export function buildPayslipBreakdownFromPayrollRow(row: Record<string, unknown>): PayslipBuildResult {
  const payGrade = resolvePayGradeFromRow(row);
  const attendanceExtras = attendanceExtrasFromRow(row);
  const earned = resolveEarnedCompensation(row, payGrade);

  const statutoryConfig = resolveStatutoryConfig(
    payGrade.statutorySource,
    {
      is_pf_applicable: row.esd_is_pf_applicable as boolean | null,
      is_esi_applicable: row.esd_is_esi_applicable as boolean | null,
      is_lwf_applicable: row.esd_is_lwf_applicable as boolean | null,
      employee_pf_percentage: row.esd_employee_pf_percentage as string | null,
      employee_esi_percentage: row.esd_employee_esi_percentage as string | null,
      employee_lwf_percentage: row.esd_employee_lwf_percentage as string | null,
      employee_pf_max_amount: row.esd_employee_pf_max_amount as string | null,
      employee_esi_max_amount: row.esd_employee_esi_max_amount as string | null,
      employee_lwf_max_amount: row.esd_employee_lwf_max_amount as string | null,
    },
  );

  return buildPayslipBreakdown({
    gradeBasic: payGrade.gradeBasicRate,
    gradeHra: payGrade.gradeHraRate,
    gradeSpecial: payGrade.gradeSpecialRate,
    basicEarned: earned.basicEarned,
    hraEarned: earned.hraEarned,
    specialEarned: earned.specialEarned,
    overtimePay: attendanceExtras.overtimePay,
    nightAllowance: attendanceExtras.nightAllowance,
    punctualityAward: attendanceExtras.punctualityAward,
    bonus: attendanceExtras.bonus,
    monthlyGross: payGrade.monthlyGross,
    statutoryConfig,
  });
}

export function resolvePayslipCalendarDays(row: Record<string, unknown>): number {
  const { month, year } = resolvePayPeriod(row);
  return month > 0 && year > 0 ? daysInMonth(year, month) : 0;
}

export function resolvePayslipAttendanceSummary(row: Record<string, unknown>): {
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  absentDays: number;
} {
  const calendarDays = resolvePayslipCalendarDays(row);
  const presentDays = toNumber(row.present_days as string | number | undefined);
  const leaveDays = toNumber(row.leave_days as string | number | undefined);
  const absentDays = toNumber(row.absent_days as string | number | undefined);

  if (calendarDays > 0) {
    return {
      workingDays: calendarDays,
      presentDays,
      leaveDays,
      absentDays: Math.max(0, calendarDays - presentDays - leaveDays),
    };
  }

  const attendance = row.attendance_summary as Record<string, number> | undefined;
  return {
    workingDays: attendance?.workingDays ?? 0,
    presentDays: attendance?.presentDays ?? presentDays,
    leaveDays: attendance?.leaveDays ?? leaveDays,
    absentDays: attendance?.absentDays ?? absentDays,
  };
}
