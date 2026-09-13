import { roundOff } from '../../utils/formatters';

/** Statutory cap: 12% of ₹15,000 wage ceiling */
export const EMPLOYEE_PF_MAX_CONTRIBUTION = 1800;
export const ESI_GROSS_CEILING = 21000;

export const DEFAULT_EMPLOYEE_PF_PERCENTAGE = 12;
export const DEFAULT_EMPLOYEE_ESI_PERCENTAGE = 0.75;
export const DEFAULT_EMPLOYER_PF_PERCENTAGE = 12;
export const DEFAULT_EMPLOYER_ESI_PERCENTAGE = 3.25;
export const DEFAULT_EMPLOYEE_LWF_PERCENTAGE = 0.2;
export const DEFAULT_EMPLOYEE_PF_MAX_AMOUNT = EMPLOYEE_PF_MAX_CONTRIBUTION;
export const DEFAULT_EMPLOYEE_ESI_MAX_AMOUNT = 0;
export const DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT = 35;

export interface StatutoryContributionConfig {
  pfApplicable: boolean;
  esiApplicable: boolean;
  lwfApplicable: boolean;
  employeePfPercentage: number;
  employeeEsiPercentage: number;
  employeeLwfPercentage: number;
  employeePfMaxAmount: number;
  employeeEsiMaxAmount: number;
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
  employee_pf_max_amount?: number | string | null;
  employee_esi_max_amount?: number | string | null;
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

/**
 * Employee Master statutory flags are authoritative for PF/ESI/LWF applicability.
 * Grade percentages remain a fallback when employee rates are not set.
 */
export function resolveStatutoryConfig(
  grade?: StatutorySourceRow | null,
  employeeStatutory?: StatutorySourceRow | null,
): StatutoryContributionConfig {
  const hasGrade = grade != null;
  const pfApplicable = toBool(employeeStatutory?.is_pf_applicable, true);
  const esiApplicable = toBool(employeeStatutory?.is_esi_applicable, true);
  const lwfApplicable = toBool(
    employeeStatutory?.is_lwf_applicable,
    hasGrade ? toBool(grade.is_lwf_applicable, true) : true,
  );

  return {
    pfApplicable,
    esiApplicable,
    lwfApplicable,
    employeePfPercentage: toPercent(
      employeeStatutory?.employee_pf_percentage ?? grade?.employee_pf_percentage,
      DEFAULT_EMPLOYEE_PF_PERCENTAGE,
    ),
    employeeEsiPercentage: toPercent(
      employeeStatutory?.employee_esi_percentage ?? grade?.employee_esi_percentage,
      DEFAULT_EMPLOYEE_ESI_PERCENTAGE,
    ),
    employeeLwfPercentage: toPercent(
      employeeStatutory?.employee_lwf_percentage ?? grade?.employee_lwf_percentage,
      DEFAULT_EMPLOYEE_LWF_PERCENTAGE,
    ),
    employeePfMaxAmount: toAmount(
      employeeStatutory?.employee_pf_max_amount ?? grade?.employee_pf_max_amount,
      DEFAULT_EMPLOYEE_PF_MAX_AMOUNT,
    ),
    employeeEsiMaxAmount: toAmount(
      employeeStatutory?.employee_esi_max_amount ?? grade?.employee_esi_max_amount,
      DEFAULT_EMPLOYEE_ESI_MAX_AMOUNT,
    ),
    employeeLwfMaxAmount: toAmount(
      employeeStatutory?.employee_lwf_max_amount ?? grade?.employee_lwf_max_amount,
      DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT,
    ),
    employerPfPercentage: toPercent(
      grade?.employer_pf_percentage,
      DEFAULT_EMPLOYER_PF_PERCENTAGE,
    ),
    employerEsiPercentage: toPercent(
      grade?.employer_esi_percentage,
      DEFAULT_EMPLOYER_ESI_PERCENTAGE,
    ),
  };
}

function applyContributionCap(calculated: number, maxAmount: number): number {
  if (maxAmount > 0) return roundOff(Math.min(calculated, maxAmount));
  return roundOff(calculated);
}

/** Employee PF = min(rate% of basic earned, configured max) when applicable. */
export function computeEmployeePf(basicEarned: number, config: StatutoryContributionConfig): number {
  if (!config.pfApplicable || basicEarned <= 0) return 0;
  const calculated = basicEarned * (config.employeePfPercentage / 100);
  return applyContributionCap(calculated, config.employeePfMaxAmount || EMPLOYEE_PF_MAX_CONTRIBUTION);
}

/** Employee ESIC = rate% of ESIC gross earned when applicable and within wage ceiling. */
export function computeEmployeeEsi(
  esiGrossEarned: number,
  monthlyGrossSalary: number,
  config: StatutoryContributionConfig,
): number {
  if (!config.esiApplicable || esiGrossEarned <= 0 || monthlyGrossSalary > ESI_GROSS_CEILING) return 0;
  const calculated = esiGrossEarned * (config.employeeEsiPercentage / 100);
  return applyContributionCap(calculated, config.employeeEsiMaxAmount);
}

/** Employee LWF = min(rate% of statutory gross earned, max amount) when applicable. */
export function computeEmployeeLwf(statutoryGrossEarned: number, config: StatutoryContributionConfig): number {
  if (!config.lwfApplicable || statutoryGrossEarned <= 0) return 0;
  const calculated = statutoryGrossEarned * (config.employeeLwfPercentage / 100);
  return applyContributionCap(calculated, config.employeeLwfMaxAmount);
}

export function computeEmployerPf(basicEarned: number, config: StatutoryContributionConfig): number {
  if (!config.pfApplicable || basicEarned <= 0) return 0;
  const calculated = basicEarned * (config.employerPfPercentage / 100);
  return applyContributionCap(calculated, config.employeePfMaxAmount || EMPLOYEE_PF_MAX_CONTRIBUTION);
}

export function computeEmployerEsi(
  grossEarned: number,
  monthlyGrossSalary: number,
  config: StatutoryContributionConfig,
): number {
  if (!config.esiApplicable || grossEarned <= 0 || monthlyGrossSalary > ESI_GROSS_CEILING) return 0;
  const calculated = grossEarned * (config.employerEsiPercentage / 100);
  return applyContributionCap(calculated, config.employeeEsiMaxAmount);
}

export function computeTotalGrossEarned(
  basicEarned: number,
  hraEarned: number,
  specialAllowanceEarned: number,
  nightAllowance: number,
  punctualityAward: number,
  overtimePay: number,
  bonus = 0,
): number {
  return roundOff(
    basicEarned
      + hraEarned
      + specialAllowanceEarned
      + nightAllowance
      + punctualityAward
      + overtimePay
      + bonus,
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

/** LWF base: basic + HRA + night allowance + punctuality + OT + bonus (excludes special allowance). */
export function computeStatutoryGrossEarned(
  basicEarned: number,
  hraEarned: number,
  nightAllowance: number,
  punctualityAward: number,
  overtimePay: number,
  bonus = 0,
): number {
  return roundOff(basicEarned + hraEarned + nightAllowance + punctualityAward + overtimePay + bonus);
}
