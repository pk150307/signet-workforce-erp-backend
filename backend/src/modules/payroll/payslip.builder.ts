import { roundOff } from '../../utils/formatters';
import {
  EMPLOYEE_PF_MAX_CONTRIBUTION,
  StatutoryContributionConfig,
  computeEmployeeEsi,
  computeEmployeeLwf,
  computeEmployeePf,
  computeEsiGrossEarned,
  computeStatutoryGrossEarned,
  computeTotalGrossEarned,
} from '../statutory/statutory.calculation';
import { PayslipLineItem } from './payslip.types';

export interface PayslipBuildInput {
  gradeBasic: number;
  gradeHra: number;
  gradeSpecial: number;
  basicEarned: number;
  hraEarned: number;
  specialEarned: number;
  overtimePay: number;
  nightAllowance: number;
  punctualityAward: number;
  monthlyGross: number;
  statutoryConfig: StatutoryContributionConfig;
}

export interface PayslipBuildResult {
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
}

export function buildPayslipBreakdown(input: PayslipBuildInput): PayslipBuildResult {
  const earnings: PayslipLineItem[] = [];

  earnings.push({
    code: 'BASIC',
    label: 'Basic Salary',
    rate: input.gradeBasic > 0 ? roundOff(input.gradeBasic) : null,
    amount: roundOff(input.basicEarned),
  });

  earnings.push({
    code: 'HRA',
    label: 'HRA',
    rate: input.gradeHra > 0 ? roundOff(input.gradeHra) : null,
    amount: roundOff(input.hraEarned),
  });

  earnings.push({
    code: 'OT',
    label: 'Overtime',
    rate: null,
    amount: roundOff(input.overtimePay),
  });

  earnings.push({
    code: 'NA',
    label: 'Night Allowance',
    rate: null,
    amount: roundOff(input.nightAllowance),
  });

  earnings.push({
    code: 'PA',
    label: 'Punctuality Award',
    rate: null,
    amount: roundOff(input.punctualityAward),
  });

  if (input.specialEarned > 0 || input.gradeSpecial > 0) {
    earnings.push({
      code: 'SA',
      label: 'Special Allowance',
      rate: input.gradeSpecial > 0 ? roundOff(input.gradeSpecial) : null,
      amount: roundOff(input.specialEarned),
    });
  }

  const grossEarnings = computeTotalGrossEarned(
    input.basicEarned,
    input.hraEarned,
    input.specialEarned,
    input.nightAllowance,
    input.punctualityAward,
    input.overtimePay,
  );

  const esiGross = computeEsiGrossEarned(
    input.basicEarned,
    input.hraEarned,
    input.nightAllowance,
    input.overtimePay,
  );

  const lwfGross = computeStatutoryGrossEarned(
    input.basicEarned,
    input.hraEarned,
    input.nightAllowance,
    input.punctualityAward,
    input.overtimePay,
  );

  const pf = computeEmployeePf(input.basicEarned, input.statutoryConfig);
  const esi = computeEmployeeEsi(esiGross, input.monthlyGross, input.statutoryConfig);
  const lwf = computeEmployeeLwf(lwfGross, input.statutoryConfig);

  const deductions: PayslipLineItem[] = [];

  if (input.statutoryConfig.pfApplicable) {
    deductions.push({
      code: 'PF',
      label: 'EPF',
      note: `${input.statutoryConfig.employeePfPercentage}% of Basic Earned (max ₹${EMPLOYEE_PF_MAX_CONTRIBUTION.toLocaleString('en-IN')})`,
      amount: pf,
    });
  }

  if (input.statutoryConfig.esiApplicable) {
    deductions.push({
      code: 'ESI',
      label: 'ESIC',
      note: `${input.statutoryConfig.employeeEsiPercentage}% of Gross Earned (excl. Punctuality Award)`,
      amount: esi,
    });
  }

  if (input.statutoryConfig.lwfApplicable) {
    deductions.push({
      code: 'LWF',
      label: 'Labour Welfare Fund',
      note: `${input.statutoryConfig.employeeLwfPercentage}% of Gross or ₹${input.statutoryConfig.employeeLwfMaxAmount} (whichever is less)`,
      amount: lwf,
    });
  }

  const totalDeductions = roundOff(pf + esi + lwf);
  const netSalary = roundOff(grossEarnings - totalDeductions);

  return {
    earnings,
    deductions,
    grossEarnings,
    totalDeductions,
    netSalary,
  };
}
