import { daysInMonth, roundOff } from '../../utils/formatters';
import {
  DEFAULT_EMPLOYEE_ESI_MAX_AMOUNT,
  DEFAULT_EMPLOYEE_ESI_PERCENTAGE,
  DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT,
  DEFAULT_EMPLOYEE_LWF_PERCENTAGE,
  DEFAULT_EMPLOYEE_PF_MAX_AMOUNT,
  DEFAULT_EMPLOYEE_PF_PERCENTAGE,
  DEFAULT_EMPLOYER_ESI_PERCENTAGE,
  DEFAULT_EMPLOYER_PF_PERCENTAGE,
  StatutoryContributionConfig,
  computeEmployeeEsi,
  computeEmployeeLwf,
  computeEmployeePf,
  computeEsiGrossEarned,
  computeStatutoryGrossEarned,
  resolveStatutoryConfig,
} from '../statutory/statutory.calculation';

/** Excel ROUND(value, 0) — nearest whole rupee (same as payslip `roundOff`). */
export function roundPayrollAmount(value: number): number {
  return roundOff(value);
}

/**
 * Snapshot stored on salary_registers.config_snapshot.
 * Percentage form matches payslip / Employee Master (e.g. 12, 0.75, 0.2).
 */
export interface SalaryStatutoryConfig {
  employeePfPercentage: number;
  employeeEsiPercentage: number;
  employeeLwfPercentage: number;
  employeePfMaxAmount: number;
  employeeEsiMaxAmount: number;
  employeeLwfMaxAmount: number;
  /** @deprecated legacy decimal rate snapshots (epfRate: 0.12) */
  epfRate?: number;
  esicRate?: number;
  lwfRate?: number;
  lwfCap?: number | null;
  pfWageCeiling?: number | null;
  esicCeiling?: number | null;
}

export const DEFAULT_SALARY_STATUTORY_CONFIG: SalaryStatutoryConfig = {
  employeePfPercentage: DEFAULT_EMPLOYEE_PF_PERCENTAGE,
  employeeEsiPercentage: DEFAULT_EMPLOYEE_ESI_PERCENTAGE,
  employeeLwfPercentage: DEFAULT_EMPLOYEE_LWF_PERCENTAGE,
  employeePfMaxAmount: DEFAULT_EMPLOYEE_PF_MAX_AMOUNT,
  employeeEsiMaxAmount: DEFAULT_EMPLOYEE_ESI_MAX_AMOUNT,
  employeeLwfMaxAmount: DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT,
};

export interface SalaryCalcInput {
  monthDays: number;
  payDays: number;
  basic: number;
  hra: number;
  /** Authoritative OT amount from Attendance — never derived from OT hours. */
  otAmount: number;
  nAll: number;
  attAwAfd: number;
  /** Attendance bonus — included in LWF wage base (same as payslip). */
  bonus?: number;
  pfEligible: boolean;
  esiEligible: boolean;
  lwfEligible: boolean;
  config: SalaryStatutoryConfig;
}

export interface SalaryCalcResult {
  monthDays: number;
  payDays: number;
  basic: number;
  hra: number;
  fixedTotal: number;
  earningBasic: number;
  earningHra: number;
  otAmount: number;
  nAll: number;
  grossEarnings: number;
  attAwAfd: number;
  grossTotal: number;
  esic: number;
  epf: number;
  lwf: number;
  totalDeduction: number;
  netPay: number;
}

/**
 * OT Amount must come from Attendance.
 * This helper exists so callers never accidentally reintroduce OT-hours math.
 */
export function getOtAmountFromAttendance(attendanceOtAmount: number | null | undefined): number {
  const n = Number(attendanceOtAmount);
  return Number.isFinite(n) && n >= 0 ? roundPayrollAmount(n) : 0;
}

export function calculateMonthDays(year: number, month: number): number {
  return daysInMonth(year, month);
}

export function calculateFixedTotal(basic: number, hra: number): number {
  return roundPayrollAmount((basic || 0) + (hra || 0));
}

export function calculateEarningBasic(basic: number, payDays: number, monthDays: number): number {
  if (!monthDays || basic == null || payDays == null) return 0;
  return roundPayrollAmount((basic * payDays) / monthDays);
}

export function calculateEarningHra(hra: number, payDays: number, monthDays: number): number {
  if (!monthDays || hra == null || payDays == null) return 0;
  return roundPayrollAmount((hra * payDays) / monthDays);
}

export function calculateGrossEarnings(
  earningBasic: number,
  earningHra: number,
  otAmount: number,
  nAll: number,
): number {
  return roundPayrollAmount(earningBasic + earningHra + otAmount + nAll);
}

export function calculateGrossTotal(grossEarnings: number, attAwAfd: number): number {
  return roundPayrollAmount(grossEarnings + (attAwAfd || 0));
}

/** Normalize legacy decimal-rate snapshots and percentage snapshots to one shape. */
export function normalizeSalaryStatutoryConfig(
  raw: Partial<SalaryStatutoryConfig> | null | undefined,
): SalaryStatutoryConfig {
  const base = { ...DEFAULT_SALARY_STATUTORY_CONFIG, ...(raw ?? {}) };

  // Legacy snapshot: rates stored as decimals (0.12 / 0.0075 / 0.002)
  if (
    (raw?.employeePfPercentage == null || !Number.isFinite(raw.employeePfPercentage)) &&
    raw?.epfRate != null &&
    Number.isFinite(raw.epfRate)
  ) {
    const epfRate = Number(raw.epfRate);
    const esicRate = Number(raw.esicRate ?? DEFAULT_EMPLOYEE_ESI_PERCENTAGE / 100);
    const lwfRate = Number(raw.lwfRate ?? DEFAULT_EMPLOYEE_LWF_PERCENTAGE / 100);
    const pfWageCeiling =
      raw.pfWageCeiling != null && Number.isFinite(raw.pfWageCeiling)
        ? Number(raw.pfWageCeiling)
        : null;

    return {
      employeePfPercentage: Math.round(epfRate * 10000) / 100, // 0.12 → 12
      employeeEsiPercentage: Math.round(esicRate * 10000) / 100, // 0.0075 → 0.75
      employeeLwfPercentage: Math.round(lwfRate * 10000) / 100, // 0.002 → 0.2
      employeePfMaxAmount:
        pfWageCeiling != null && epfRate > 0
          ? roundPayrollAmount(pfWageCeiling * epfRate)
          : DEFAULT_EMPLOYEE_PF_MAX_AMOUNT,
      employeeEsiMaxAmount: DEFAULT_EMPLOYEE_ESI_MAX_AMOUNT,
      employeeLwfMaxAmount:
        raw.lwfCap != null && Number(raw.lwfCap) > 0
          ? Number(raw.lwfCap)
          : DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT,
    };
  }

  return {
    employeePfPercentage: Number(base.employeePfPercentage) || DEFAULT_EMPLOYEE_PF_PERCENTAGE,
    employeeEsiPercentage: Number(base.employeeEsiPercentage) || DEFAULT_EMPLOYEE_ESI_PERCENTAGE,
    employeeLwfPercentage: Number(base.employeeLwfPercentage) || DEFAULT_EMPLOYEE_LWF_PERCENTAGE,
    employeePfMaxAmount: Number(base.employeePfMaxAmount) || DEFAULT_EMPLOYEE_PF_MAX_AMOUNT,
    employeeEsiMaxAmount:
      base.employeeEsiMaxAmount != null && Number.isFinite(Number(base.employeeEsiMaxAmount))
        ? Number(base.employeeEsiMaxAmount)
        : DEFAULT_EMPLOYEE_ESI_MAX_AMOUNT,
    employeeLwfMaxAmount:
      base.employeeLwfMaxAmount != null && Number.isFinite(Number(base.employeeLwfMaxAmount))
        ? Number(base.employeeLwfMaxAmount)
        : DEFAULT_EMPLOYEE_LWF_MAX_AMOUNT,
  };
}

export function toStatutoryContributionConfig(
  config: SalaryStatutoryConfig,
  flags: { pfEligible: boolean; esiEligible: boolean; lwfEligible: boolean },
): StatutoryContributionConfig {
  const normalized = normalizeSalaryStatutoryConfig(config);
  return {
    pfApplicable: flags.pfEligible,
    esiApplicable: flags.esiEligible,
    lwfApplicable: flags.lwfEligible,
    employeePfPercentage: normalized.employeePfPercentage,
    employeeEsiPercentage: normalized.employeeEsiPercentage,
    employeeLwfPercentage: normalized.employeeLwfPercentage,
    employeePfMaxAmount: normalized.employeePfMaxAmount,
    employeeEsiMaxAmount: normalized.employeeEsiMaxAmount,
    employeeLwfMaxAmount: normalized.employeeLwfMaxAmount,
    employerPfPercentage: DEFAULT_EMPLOYER_PF_PERCENTAGE,
    employerEsiPercentage: DEFAULT_EMPLOYER_ESI_PERCENTAGE,
  };
}

/**
 * ESIC wage base = basic + HRA + night + OT (excludes punctuality) — same as payslip.
 * Eligibility uses contractual monthly gross (basic + HRA).
 */
export function calculateEsic(
  earningBasic: number,
  earningHra: number,
  nAll: number,
  otAmount: number,
  monthlyGross: number,
  esiEligible: boolean,
  config: SalaryStatutoryConfig,
): number {
  if (!esiEligible) return 0;
  const statutory = toStatutoryContributionConfig(config, {
    pfEligible: true,
    esiEligible: true,
    lwfEligible: true,
  });
  const esiGross = computeEsiGrossEarned(earningBasic, earningHra, nAll, otAmount);
  return computeEmployeeEsi(esiGross, monthlyGross, statutory);
}

/** EPF = min(rate% of earning basic, max contribution) — same as payslip. */
export function calculateEpf(
  earningBasic: number,
  pfEligible: boolean,
  config: SalaryStatutoryConfig,
): number {
  if (!pfEligible) return 0;
  const statutory = toStatutoryContributionConfig(config, {
    pfEligible: true,
    esiEligible: true,
    lwfEligible: true,
  });
  return computeEmployeePf(earningBasic, statutory);
}

/**
 * LWF wage base = basic + HRA + night + punctuality + OT + bonus — same as payslip.
 * Amount = min(rate% of base, max) with shared rounding.
 */
export function calculateLwf(
  earningBasic: number,
  earningHra: number,
  nAll: number,
  attAwAfd: number,
  otAmount: number,
  bonus: number,
  lwfEligible: boolean,
  config: SalaryStatutoryConfig,
): number {
  if (!lwfEligible) return 0;
  const statutory = toStatutoryContributionConfig(config, {
    pfEligible: true,
    esiEligible: true,
    lwfEligible: true,
  });
  const lwfGross = computeStatutoryGrossEarned(
    earningBasic,
    earningHra,
    nAll,
    attAwAfd,
    otAmount,
    bonus,
  );
  return computeEmployeeLwf(lwfGross, statutory);
}

export function calculateTotalDeduction(esic: number, epf: number, lwf: number): number {
  return roundPayrollAmount(esic + epf + lwf);
}

export function calculateNetPay(grossTotal: number, totalDeduction: number): number {
  return roundPayrollAmount(grossTotal - totalDeduction);
}

export function calculateSalaryRow(input: SalaryCalcInput): SalaryCalcResult {
  const monthDays = input.monthDays;
  const payDays = input.payDays;
  const basic = input.basic || 0;
  const hra = input.hra || 0;
  const otAmount = getOtAmountFromAttendance(input.otAmount);
  const nAll = roundPayrollAmount(input.nAll || 0);
  const attAwAfd = roundPayrollAmount(input.attAwAfd || 0);
  const bonus = roundPayrollAmount(input.bonus || 0);
  const config = normalizeSalaryStatutoryConfig(input.config);

  const fixedTotal = calculateFixedTotal(basic, hra);
  const earningBasic = calculateEarningBasic(basic, payDays, monthDays);
  const earningHra = calculateEarningHra(hra, payDays, monthDays);
  const grossEarnings = calculateGrossEarnings(earningBasic, earningHra, otAmount, nAll);
  const grossTotal = calculateGrossTotal(grossEarnings, attAwAfd);

  const esic = calculateEsic(
    earningBasic,
    earningHra,
    nAll,
    otAmount,
    fixedTotal,
    input.esiEligible,
    config,
  );
  const epf = calculateEpf(earningBasic, input.pfEligible, config);
  const lwf = calculateLwf(
    earningBasic,
    earningHra,
    nAll,
    attAwAfd,
    otAmount,
    bonus,
    input.lwfEligible,
    config,
  );
  const totalDeduction = calculateTotalDeduction(esic, epf, lwf);
  const netPay = calculateNetPay(grossTotal, totalDeduction);

  return {
    monthDays,
    payDays,
    basic,
    hra,
    fixedTotal,
    earningBasic,
    earningHra,
    otAmount,
    nAll,
    grossEarnings,
    attAwAfd,
    grossTotal,
    esic,
    epf,
    lwf,
    totalDeduction,
    netPay,
  };
}

/** Build config snapshot from employee % fields — same defaults as payslip. */
export function buildConfigSnapshot(params: {
  employeePfPercentage?: number | null;
  employeeEsiPercentage?: number | null;
  employeeLwfPercentage?: number | null;
  employeePfMaxAmount?: number | null;
  employeeEsiMaxAmount?: number | null;
  employeeLwfMaxAmount?: number | null;
  defaults?: Partial<SalaryStatutoryConfig>;
}): SalaryStatutoryConfig {
  const defaults = normalizeSalaryStatutoryConfig(params.defaults);

  const resolved = resolveStatutoryConfig(null, {
    employee_pf_percentage: params.employeePfPercentage ?? defaults.employeePfPercentage,
    employee_esi_percentage: params.employeeEsiPercentage ?? defaults.employeeEsiPercentage,
    employee_lwf_percentage: params.employeeLwfPercentage ?? defaults.employeeLwfPercentage,
    employee_pf_max_amount: params.employeePfMaxAmount ?? defaults.employeePfMaxAmount,
    employee_esi_max_amount: params.employeeEsiMaxAmount ?? defaults.employeeEsiMaxAmount,
    employee_lwf_max_amount: params.employeeLwfMaxAmount ?? defaults.employeeLwfMaxAmount,
  });

  return {
    employeePfPercentage: resolved.employeePfPercentage,
    employeeEsiPercentage: resolved.employeeEsiPercentage,
    employeeLwfPercentage: resolved.employeeLwfPercentage,
    employeePfMaxAmount: resolved.employeePfMaxAmount,
    employeeEsiMaxAmount: resolved.employeeEsiMaxAmount,
    employeeLwfMaxAmount: resolved.employeeLwfMaxAmount,
  };
}
