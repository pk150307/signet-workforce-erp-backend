import { toNumber } from '../../utils/formatters';
import { computeGradeGross } from './designation-grade.types';
import { GradeCompensation, gradeCompensationFromRow } from './designation-grade.compensation';
import { StatutorySourceRow } from '../statutory/statutory.calculation';

/** SQL fragment: resolves pay grade for employee designation (handles mismatched grade assignment). */
export const EMPLOYEE_PAY_GRADE_JOINS = `
  LEFT JOIN designation_grades assigned_dg
    ON assigned_dg.id = COALESCE(ed.designation_grade_id, e.designation_grade_id)
   AND NOT assigned_dg.is_deleted
  LEFT JOIN designation_grades dg ON NOT dg.is_deleted
   AND dg.designation_id = COALESCE(ed.designation_id, e.designation_id)
   AND (
     (assigned_dg.id IS NOT NULL
      AND assigned_dg.designation_id = COALESCE(ed.designation_id, e.designation_id)
      AND dg.id = assigned_dg.id)
     OR (assigned_dg.id IS NOT NULL
         AND assigned_dg.designation_id IS DISTINCT FROM COALESCE(ed.designation_id, e.designation_id)
         AND dg.code = assigned_dg.code)
     OR (assigned_dg.id IS NULL
         AND dg.is_active = TRUE
         AND dg.level = (
           SELECT MIN(g2.level)
           FROM designation_grades g2
           WHERE g2.designation_id = COALESCE(ed.designation_id, e.designation_id)
             AND NOT g2.is_deleted
             AND g2.is_active
         ))
   )`;

export const EMPLOYEE_PAY_GRADE_SELECT = `
  COALESCE(ed.designation_id, e.designation_id) AS employee_designation_id,
  dg.id AS designation_grade_id,
  COALESCE(dg.basic_salary, 0) AS grade_basic_salary,
  COALESCE(dg.house_rent_allowance, 0) AS grade_house_rent_allowance,
  COALESCE(dg.special_allowance, 0) AS grade_special_allowance,
  COALESCE(ed.basic_salary, e.basic_salary) AS employment_basic_salary,
  COALESCE(ed.gross_salary, e.gross_salary) AS employment_gross_salary,
  dg.is_pf_applicable AS grade_is_pf_applicable,
  dg.is_esi_applicable AS grade_is_esi_applicable,
  dg.employee_pf_percentage AS grade_employee_pf_percentage,
  dg.employee_esi_percentage AS grade_employee_esi_percentage,
  dg.employer_pf_percentage AS grade_employer_pf_percentage,
  dg.employer_esi_percentage AS grade_employer_esi_percentage,
  dg.is_lwf_applicable AS grade_is_lwf_applicable,
  dg.employee_lwf_percentage AS grade_employee_lwf_percentage,
  dg.employee_lwf_max_amount AS grade_employee_lwf_max_amount`;

export interface ResolvedPayGrade {
  gradeComp: GradeCompensation | null;
  gradeId: string | null;
  statutorySource: StatutorySourceRow | null;
  monthlyGross: number;
  gradeBasicRate: number;
  gradeHraRate: number;
  gradeSpecialRate: number;
}

export function resolvePayGradeFromRow(row: Record<string, unknown>): ResolvedPayGrade {
  const gradeId = row.designation_grade_id != null ? String(row.designation_grade_id) : null;
  let gradeBasic = toNumber(
    (row.grade_basic_salary ?? row.basic_salary) as string | number | undefined,
  );
  let gradeHra = toNumber(
    (row.grade_house_rent_allowance ?? row.house_rent_allowance) as string | number | undefined,
  );
  let gradeSpecial = toNumber(
    (row.grade_special_allowance ?? row.special_allowance) as string | number | undefined,
  );
  const employmentBasic = toNumber(row.employment_basic_salary as string | number | undefined);
  const employmentGross = toNumber(row.employment_gross_salary as string | number | undefined);

  if (gradeBasic <= 0 && employmentBasic > 0) {
    gradeBasic = employmentBasic;
    if (gradeHra <= 0 && employmentGross > employmentBasic) {
      gradeHra = Math.max(0, employmentGross - employmentBasic - gradeSpecial);
    }
  }

  const hasGrade = gradeId != null && gradeBasic > 0;
  const gradeComp = hasGrade
    ? {
        basicSalary: gradeBasic,
        houseRentAllowance: gradeHra,
        specialAllowance: gradeSpecial,
        grossSalary: computeGradeGross({
          basicSalary: gradeBasic,
          houseRentAllowance: gradeHra,
          specialAllowance: gradeSpecial,
        }),
      }
    : null;

  const monthlyGross = gradeComp?.grossSalary ?? employmentGross;

  const statutorySource: StatutorySourceRow | null = gradeId
    ? {
        is_pf_applicable: row.grade_is_pf_applicable as boolean | null,
        is_esi_applicable: row.grade_is_esi_applicable as boolean | null,
        employee_pf_percentage: row.grade_employee_pf_percentage as string | null,
        employee_esi_percentage: row.grade_employee_esi_percentage as string | null,
        employer_pf_percentage: row.grade_employer_pf_percentage as string | null,
        employer_esi_percentage: row.grade_employer_esi_percentage as string | null,
        is_lwf_applicable: row.grade_is_lwf_applicable as boolean | null,
        employee_lwf_percentage: row.grade_employee_lwf_percentage as string | null,
        employee_lwf_max_amount: row.grade_employee_lwf_max_amount as string | null,
      }
    : null;

  return {
    gradeComp,
    gradeId,
    statutorySource,
    monthlyGross,
    gradeBasicRate: gradeBasic,
    gradeHraRate: gradeHra,
    gradeSpecialRate: gradeSpecial,
  };
}

export function gradeCompensationFromResolved(row: Record<string, unknown>): GradeCompensation | null {
  return resolvePayGradeFromRow(row).gradeComp;
}

export function gradeCompensationFromRowWithFallback(row: Record<string, unknown>): GradeCompensation | null {
  const resolved = resolvePayGradeFromRow(row);
  if (resolved.gradeComp) return resolved.gradeComp;
  return row.designation_grade_id != null ? gradeCompensationFromRow(row) : null;
}
