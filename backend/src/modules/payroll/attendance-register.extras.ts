import { roundOff } from '../../utils/formatters';

/** Attendance register extras: overtime_hours column stores OT earned in rupees (not hours). */
export const ATTENDANCE_REGISTER_EXTRAS_SELECT = `
  COALESCE(reg_extras.register_overtime_amount, 0) AS register_overtime_amount,
  COALESCE(reg_extras.register_night_allowance, 0) AS register_night_allowance,
  COALESCE(reg_extras.register_punctuality_award, 0) AS register_punctuality_award`;

export function attendanceRegisterExtrasJoin(
  employeeIdExpr: string,
  monthExpr: string,
  yearExpr: string,
): string {
  return `
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(aro.overtime_hours), 0) AS register_overtime_amount,
           COALESCE(SUM(aro.night_allowance), 0) AS register_night_allowance,
           COALESCE(SUM(aro.punctuality_award), 0) AS register_punctuality_award
    FROM attendance_register_employee_overtime aro
    INNER JOIN attendance_registers ar ON ar.id = aro.register_id
    WHERE aro.employee_id = ${employeeIdExpr}
      AND ar.month = ${monthExpr}
      AND ar.year = ${yearExpr}
  ) reg_extras ON TRUE`;
}

export function attendanceExtrasFromRow(row: Record<string, unknown>): {
  overtimePay: number;
  nightAllowance: number;
  punctualityAward: number;
} {
  const toAmount = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  if ('register_overtime_amount' in row || 'register_night_allowance' in row) {
    return {
      overtimePay: roundOff(toAmount(row.register_overtime_amount)),
      nightAllowance: roundOff(toAmount(row.register_night_allowance)),
      punctualityAward: roundOff(toAmount(row.register_punctuality_award)),
    };
  }

  return {
    overtimePay: roundOff(toAmount(row.overtime_pay ?? row.overtime_hours)),
    nightAllowance: roundOff(toAmount(row.night_allowance)),
    punctualityAward: roundOff(toAmount(row.punctuality_award)),
  };
}
