import { roundOff } from '../../utils/formatters';

/** Statutory cap: 12% of ₹15,000 wage ceiling */
export const EMPLOYEE_PF_MAX_CONTRIBUTION = 1800;
export const ESI_GROSS_CEILING = 21000;

export const DEFAULT_EMPLOYEE_PF_PERCENTAGE = 12;
export const DEFAULT_EMPLOYEE_ESI_PERCENTAGE = 0.75;
export const DEFAULT_EMPLOYER_PF_PERCENTAGE = 12;
export const DEFAULT_EMPLOYER_ESI_PERCENTAGE = 3.25;
export const DEFAULT_EMPLOYEE_LWF_PERCENTAGE = 0.2;
export const DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT = 35;

export interface StatutoryContributionConfig {
  pfApplicable: boolean;
  esiApplicable: boolean;
  lwfApplicable: boolean;
  employeePfPercentage: number;
  employeeEsiPercentage: number;
  employeeLwfPercentage: number;
  employeeLwfMaxAmount: number;
  employerPfPercentage: number;
  employerEsiPercentage: number;
}

export interface StatutorySourceRow {
  is_pf_applicable?: boolean | null;
  is_esi_applicable?: boolean | null;
  is_lwf_applicable?: boolean | null;
  employee_pf_percentage?: number | string | null;
  employee_esi_percentage?: number | string | null;
  employee_lwf_percentage?: number | string | null;
  employee_lwf_max_amount?: number | string | null;
  employer_pf_percentage?: number | string | null;
  employer_esi_percentage?: number | string | null;
}

function toPercent(value: number | string | null | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function toBool(value: boolean | null | undefined, fallback: boolean): boolean {
  return value === null || value === undefined ? fallback : Boolean(value);
}

function toAmount(value: number | string | null | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Grade config takes precedence when a pay grade is assigned; employee statutory can override applicability. */
export function resolveStatutoryConfig(
  grade?: StatutorySourceRow | null,
  employeeStatutory?: StatutorySourceRow | null,
): StatutoryContributionConfig {
  const hasGrade = grade != null;
  const pfApplicable = hasGrade
    ? toBool(grade.is_pf_applicable, true) && toBool(employeeStatutory?.is_pf_applicable, true)
    : toBool(employeeStatutory?.is_pf_applicable, true);
  const esiApplicable = hasGrade
    ? toBool(grade.is_esi_applicable, true) && toBool(employeeStatutory?.is_esi_applicable, true)
    : toBool(employeeStatutory?.is_esi_applicable, true);
  const lwfApplicable = hasGrade ? toBool(grade.is_lwf_applicable, false) : false;

  return {
    pfApplicable,
    esiApplicable,
    lwfApplicable,
    employeePfPercentage: hasGrade
      ? toPercent(grade.employee_pf_percentage, DEFAULT_EMPLOYEE_PF_PERCENTAGE)
      : toPercent(employeeStatutory?.employee_pf_percentage, DEFAULT_EMPLOYEE_PF_PERCENTAGE),
    employeeEsiPercentage: hasGrade
      ? toPercent(grade.employee_esi_percentage, DEFAULT_EMPLOYEE_ESI_PERCENTAGE)
      : toPercent(employeeStatutory?.employee_esi_percentage, DEFAULT_EMPLOYEE_ESI_PERCENTAGE),
    employeeLwfPercentage: hasGrade
      ? toPercent(grade.employee_lwf_percentage, DEFAULT_EMPLOYEE_LWF_PERCENTAGE)
      : toPercent(employeeStatutory?.employee_lwf_percentage, DEFAULT_EMPLOYEE_LWF_PERCENTAGE),
    employeeLwfMaxAmount: hasGrade
      ? toAmount(grade.employee_lwf_max_amount, DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT)
      : toAmount(employeeStatutory?.employee_lwf_max_amount, DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT),
    employerPfPercentage: hasGrade
      ? toPercent(grade.employer_pf_percentage, DEFAULT_EMPLOYER_PF_PERCENTAGE)
      : DEFAULT_EMPLOYER_PF_PERCENTAGE,
    employerEsiPercentage: hasGrade
      ? toPercent(grade.employer_esi_percentage, DEFAULT_EMPLOYER_ESI_PERCENTAGE)
      : DEFAULT_EMPLOYER_ESI_PERCENTAGE,
  };
}

/** Employee PF = min(rate% of basic earned, ₹1,800 cap) when applicable. */
export function computeEmployeePf(basicEarned: number, config: StatutoryContributionConfig): number {
  if (!config.pfApplicable || basicEarned <= 0) return 0;
  const calculated = basicEarned * (config.employeePfPercentage / 100);
  return roundOff(Math.min(calculated, EMPLOYEE_PF_MAX_CONTRIBUTION));
}

/** Employee ESIC = rate% of ESIC gross earned when applicable and within wage ceiling. */
export function computeEmployeeEsi(
  esiGrossEarned: number,
  monthlyGrossSalary: number,
  config: StatutoryContributionConfig,
): number {
  if (!config.esiApplicable || esiGrossEarned <= 0 || monthlyGrossSalary > ESI_GROSS_CEILING) return 0;
  return roundOff(esiGrossEarned * (config.employeeEsiPercentage / 100));
}

/** Employee LWF = min(rate% of statutory gross earned, max amount) when applicable. */
export function computeEmployeeLwf(statutoryGrossEarned: number, config: StatutoryContributionConfig): number {
  if (!config.lwfApplicable || statutoryGrossEarned <= 0) return 0;
  const calculated = statutoryGrossEarned * (config.employeeLwfPercentage / 100);
  return roundOff(Math.min(calculated, config.employeeLwfMaxAmount));
}

export function computeEmployerPf(basicEarned: number, config: StatutoryContributionConfig): number {
  if (!config.pfApplicable || basicEarned <= 0) return 0;
  const calculated = basicEarned * (config.employerPfPercentage / 100);
  return roundOff(Math.min(calculated, EMPLOYEE_PF_MAX_CONTRIBUTION));
}

export function computeEmployerEsi(
  grossEarned: number,
  monthlyGrossSalary: number,
  config: StatutoryContributionConfig,
): number {
  if (!config.esiApplicable || grossEarned <= 0 || monthlyGrossSalary > ESI_GROSS_CEILING) return 0;
  return roundOff(grossEarned * (config.employerEsiPercentage / 100));
}

export function computeTotalGrossEarned(
  basicEarned: number,
  hraEarned: number,
  specialAllowanceEarned: number,
  nightAllowance: number,
  punctualityAward: number,
  overtimePay: number,
): number {
  return roundOff(
    basicEarned + hraEarned + specialAllowanceEarned + nightAllowance + punctualityAward + overtimePay,
  );
}

/** ESIC base: basic + HRA + night allowance + OT (excludes punctuality award and special allowance). */
export function computeEsiGrossEarned(
  basicEarned: number,
  hraEarned: number,
  nightAllowance: number,
  overtimePay: number,
): number {
  return roundOff(basicEarned + hraEarned + nightAllowance + overtimePay);
}

/** LWF base: basic + HRA + night allowance + punctuality + OT (excludes special allowance). */
export function computeStatutoryGrossEarned(
  basicEarned: number,
  hraEarned: number,
  nightAllowance: number,
  punctualityAward: number,
  overtimePay: number,
): number {
  return roundOff(basicEarned + hraEarned + nightAllowance + punctualityAward + overtimePay);
}
