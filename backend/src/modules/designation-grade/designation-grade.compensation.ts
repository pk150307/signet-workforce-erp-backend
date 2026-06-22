import { roundOff } from '../../utils/formatters';
import { computeGradeGross } from './designation-grade.types';

export interface GradeCompensation {
  basicSalary: number;
  houseRentAllowance: number;
  specialAllowance: number;
  grossSalary: number;
}

export interface ProRatedGradeEarnings extends GradeCompensation {
  basicEarned: number;
  houseRentAllowanceEarned: number;
  specialAllowanceEarned: number;
  grossEarned: number;
}

export function proRateGradeCompensation(
  grade: GradeCompensation,
  workingDays: number,
  presentDays: number,
): ProRatedGradeEarnings {
  const ratio = workingDays > 0 ? presentDays / workingDays : 0;
  const basicEarned = roundOff(grade.basicSalary * ratio);
  const houseRentAllowanceEarned = roundOff(grade.houseRentAllowance * ratio);
  const specialAllowanceEarned = roundOff(grade.specialAllowance * ratio);
  const grossEarned = roundOff(basicEarned + houseRentAllowanceEarned + specialAllowanceEarned);

  return {
    ...grade,
    basicEarned,
    houseRentAllowanceEarned,
    specialAllowanceEarned,
    grossEarned,
  };
}

/** OT pay from attendance hours: 2x hourly rate derived from grade basic salary. */
export function computeOvertimePay(
  basicSalary: number,
  workingDays: number,
  overtimeHours: number,
): number {
  if (overtimeHours <= 0) return 0;
  const perDay = workingDays > 0 ? basicSalary / workingDays : 0;
  const hourly = perDay / 8;
  return roundOff(overtimeHours * hourly * 2);
}

export function gradeCompensationFromRow(row: Record<string, unknown>): GradeCompensation {
  const basicSalary = Number(row.basic_salary ?? 0);
  const houseRentAllowance = Number(row.house_rent_allowance ?? 0);
  const specialAllowance = Number(row.special_allowance ?? 0);
  return {
    basicSalary,
    houseRentAllowance,
    specialAllowance,
    grossSalary: computeGradeGross({
      basicSalary,
      houseRentAllowance,
      specialAllowance,
    }),
  };
}
