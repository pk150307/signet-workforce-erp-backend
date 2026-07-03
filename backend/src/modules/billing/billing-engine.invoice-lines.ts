import { BILLING_COMPONENT_CODE } from './billing.constants';
import { BillingComponentLine } from './billing-engine.types';

export interface SignetInvoiceLineInput {
  month: number;
  year: number;
  sacCode: string;
  employeeCharges: number;
  pfContribution: number;
  pfWageBase: number;
  esicContribution: number;
  lwfAmount: number;
  serviceChargeAmount: number;
  pfPct: number;
  esicPct: number;
  lwfPct: number;
  serviceChargePct: number;
}

function roundInt(value: number): number {
  return Math.round(value);
}

function formatIndianAmount(value: number): string {
  return roundInt(value).toLocaleString('en-IN');
}

/** e.g. MAY-26 for May 2026 */
export function formatBillingPeriodShort(month: number, year: number): string {
  const mon = new Date(year, month - 1, 1).toLocaleString('en', { month: 'short' }).toUpperCase();
  const yy = String(year).slice(-2);
  return `${mon}-${yy}`;
}

/** Build the 5 summary line items shown on Signet tax invoices. */
export function buildSignetTaxInvoiceLines(input: SignetInvoiceLineInput): BillingComponentLine[] {
  const period = formatBillingPeriodShort(input.month, input.year);
  const sac = input.sacCode;
  const lines: BillingComponentLine[] = [];

  if (input.employeeCharges > 0) {
    const amount = roundInt(input.employeeCharges);
    lines.push({
      componentCode: BILLING_COMPONENT_CODE.BASIC_CHARGES,
      componentName: 'Manpower Arrangement Charges',
      description: `Manpower Arrangement Charges M/o. ${period}`,
      quantity: 1,
      unitRate: amount,
      amount,
      hsnSacCode: sac,
      isTaxable: true,
    });
  }

  if (input.pfContribution > 0) {
    const amount = roundInt(input.pfContribution);
    const base = roundInt(input.pfWageBase);
    lines.push({
      componentCode: BILLING_COMPONENT_CODE.PF_CONTRIBUTION,
      componentName: 'EPF Contribution',
      description: `EPF Contribution@ ${input.pfPct}% (On Rs. ${formatIndianAmount(base)})`,
      quantity: 1,
      unitRate: amount,
      amount,
      hsnSacCode: sac,
      isTaxable: true,
    });
  }

  if (input.esicContribution > 0) {
    const amount = roundInt(input.esicContribution);
    const base = roundInt(input.employeeCharges);
    lines.push({
      componentCode: BILLING_COMPONENT_CODE.ESIC_CONTRIBUTION,
      componentName: 'ESIC Contribution',
      description: `ESIC Contribution@ ${input.esicPct}% (On Rs. ${formatIndianAmount(base)})`,
      quantity: 1,
      unitRate: amount,
      amount,
      hsnSacCode: sac,
      isTaxable: true,
    });
  }

  if (input.lwfAmount > 0) {
    const amount = roundInt(input.lwfAmount);
    lines.push({
      componentCode: BILLING_COMPONENT_CODE.LWF,
      componentName: 'L.W.F.',
      description: `L.W.F. @ ${input.lwfPct}%`,
      quantity: 1,
      unitRate: amount,
      amount,
      hsnSacCode: sac,
      isTaxable: true,
    });
  }

  if (input.serviceChargeAmount > 0) {
    const amount = roundInt(input.serviceChargeAmount);
    const base = roundInt(input.employeeCharges);
    lines.push({
      componentCode: BILLING_COMPONENT_CODE.SERVICE_CHARGES,
      componentName: 'Service Charge',
      description: `Service Charge @ ${input.serviceChargePct}% ${formatIndianAmount(base)}`,
      quantity: 1,
      unitRate: amount,
      amount,
      hsnSacCode: sac,
      isTaxable: true,
    });
  }

  return lines;
}

export function computeLwfWageBase(pfWageBase: number, employeeCharges: number): number {
  if (employeeCharges <= 0) return 0;
  if (pfWageBase <= 0) return employeeCharges;
  const diff = Math.max(employeeCharges - pfWageBase, 0);
  return Math.round((pfWageBase + diff * 0.697) * 100) / 100;
}
