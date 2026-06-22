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

function resolveEarnedCompensation(
  row: Record<string, unknown>,
  payGrade: ReturnType<typeof resolvePayGradeFromRow>,
): { basicEarned: number; hraEarned: number; specialEarned: number } {
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
    basicEarned: toNumber((row.earned_basic_salary ?? row.basic_salary) as string),
    hraEarned: toNumber((row.earned_house_rent_allowance ?? row.house_rent_allowance) as string),
    specialEarned: toNumber((row.earned_special_allowance ?? row.special_allowance) as string),
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
      employee_pf_percentage: row.esd_employee_pf_percentage as string | null,
      employee_esi_percentage: row.esd_employee_esi_percentage as string | null,
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
