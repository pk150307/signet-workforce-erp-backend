import { roundOff } from '../../utils/formatters';

/** Attendance register extras: overtime_hours column stores OT earned in rupees (not hours). */
export const ATTENDANCE_REGISTER_EXTRAS_SELECT = `
  COALESCE(reg_extras.register_overtime_amount, 0) AS register_overtime_amount,
  COALESCE(reg_extras.register_night_allowance, 0) AS register_night_allowance,
  COALESCE(reg_extras.register_punctuality_award, 0) AS register_punctuality_award,
  COALESCE(reg_extras.register_bonus, 0) AS register_bonus,
  reg_extras.register_present_days AS register_present_days`;

export function attendanceRegisterExtrasJoin(
  employeeIdExpr: string,
  monthExpr: string,
  yearExpr: string,
): string {
  return `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(aro.overtime_hours), 0) AS register_overtime_amount,
           COALESCE(SUM(aro.night_allowance), 0) AS register_night_allowance,
           COALESCE(SUM(aro.punctuality_award), 0) AS register_punctuality_award,
           COALESCE(SUM(aro.bonus), 0) AS register_bonus,
           SUM(aro.present_days) AS register_present_days
    FROM attendance_register_employee_overtime aro
    INNER JOIN attendance_registers ar ON ar.id = aro.register_id
    WHERE aro.employee_id = ${employeeIdExpr}
      AND ar.month = ${monthExpr}
      AND ar.year = ${yearExpr}
  ) reg_extras ON TRUE`;
}

function toAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasOwn(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key) && row[key] != null;
}

/**
 * Prefer frozen payroll_entry amounts when present so payslip totals match payroll processing.
 * Fall back to attendance-register extras only when payroll entry fields are absent.
 */
export function attendanceExtrasFromRow(row: Record<string, unknown>): {
  overtimePay: number;
  nightAllowance: number;
  punctualityAward: number;
  bonus: number;
  presentDays: number | null;
} {
  const hasPayrollExtras =
    hasOwn(row, 'overtime_pay')
    || hasOwn(row, 'night_allowance')
    || hasOwn(row, 'punctuality_award')
    || hasOwn(row, 'bonus');

  const presentFromPayroll = hasOwn(row, 'present_days') ? toAmount(row.present_days) : null;
  const presentFromRegister =
    row.register_present_days == null || row.register_present_days === ''
      ? null
      : toAmount(row.register_present_days);

  if (hasPayrollExtras) {
    const payrollBonus = toAmount(row.bonus);
    const registerBonus = toAmount(row.register_bonus);
    return {
      overtimePay: roundOff(toAmount(row.overtime_pay ?? row.overtime_hours)),
      nightAllowance: roundOff(toAmount(row.night_allowance)),
      punctualityAward: roundOff(toAmount(row.punctuality_award)),
      // Prefer frozen payroll bonus; fall back to register when payroll stored 0/null.
      bonus: roundOff(payrollBonus > 0 ? payrollBonus : registerBonus),
      presentDays: presentFromPayroll ?? presentFromRegister,
    };
  }

  return {
    overtimePay: roundOff(toAmount(row.register_overtime_amount ?? row.overtime_pay ?? row.overtime_hours)),
    nightAllowance: roundOff(toAmount(row.register_night_allowance ?? row.night_allowance)),
    punctualityAward: roundOff(toAmount(row.register_punctuality_award ?? row.punctuality_award)),
    bonus: roundOff(toAmount(row.register_bonus ?? row.bonus)),
    presentDays: presentFromRegister ?? presentFromPayroll,
  };
}
