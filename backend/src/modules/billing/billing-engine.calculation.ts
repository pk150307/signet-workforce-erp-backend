import { BILLING_COMPONENT_CODE } from './billing.constants';
import { BillingComponentLine, BillingEngineValidation, BillingTaxBreakdown } from './billing-engine.types';
import { buildSignetTaxInvoiceLines, computeLwfWageBase } from './billing-engine.invoice-lines';

export { computeLwfWageBase };

export interface BillingEngineTotals {
  employeeCharges: number;
  pfContribution: number;
  esicContribution: number;
  lwfAmount: number;
  serviceChargeAmount: number;
  otherCharges: number;
  penaltyAmount: number;
  adjustmentAmount: number;
  discountAmount: number;
  taxableValue: number;
  tax: BillingTaxBreakdown;
  grandTotal: number;
  components: BillingComponentLine[];
}

export interface EnabledBillingComponent {
  code: string;
  name: string;
  isEnabled: boolean;
  isTaxable: boolean;
  hsnSacCode: string;
  pctOverride: number | null;
  rateOverride: number | null;
}

export interface ComputeTaxInput {
  taxableValue: number;
  gstPct: number;
  gstType: 'cgst_sgst' | 'igst';
  companyState: string | null;
  clientState: string | null;
}

export function normalizeState(state: string | null | undefined): string {
  return (state ?? '').trim().toLowerCase();
}

export function resolveGstType(
  configuredGstType: string,
  companyState: string | null,
  clientState: string | null,
): 'cgst_sgst' | 'igst' {
  // An explicit GST type chosen in the billing configuration is authoritative
  // and must be honoured exactly as selected.
  if (configuredGstType === 'igst') return 'igst';
  if (configuredGstType === 'cgst_sgst') return 'cgst_sgst';

  // Only when no explicit type is configured (e.g. 'auto'/empty) do we derive it
  // from the place of supply: same state => CGST+SGST, otherwise IGST.
  const sameState =
    normalizeState(companyState).length > 0 &&
    normalizeState(companyState) === normalizeState(clientState);
  return sameState ? 'cgst_sgst' : 'igst';
}

export function computeTaxBreakdown(input: ComputeTaxInput): BillingTaxBreakdown {
  const gstType = resolveGstType(input.gstType, input.companyState, input.clientState);
  const taxableValue = round(input.taxableValue);
  const gstAmount = round(taxableValue * (input.gstPct / 100));

  if (gstType === 'igst') {
    return {
      gstType,
      taxableValue,
      cgstRate: 0,
      sgstRate: 0,
      igstRate: input.gstPct,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: gstAmount,
      gstAmount,
    };
  }

  const halfRate = round(input.gstPct / 2);
  const cgstAmount = round(gstAmount / 2);
  const sgstAmount = round(gstAmount - cgstAmount);

  return {
    gstType,
    taxableValue,
    cgstRate: halfRate,
    sgstRate: halfRate,
    igstRate: 0,
    cgstAmount,
    sgstAmount,
    igstAmount: 0,
    gstAmount,
  };
}

export function computeServiceCharge(baseAmount: number, serviceChargePct: number): number {
  if (baseAmount <= 0 || serviceChargePct <= 0) return 0;
  return round(baseAmount * (serviceChargePct / 100));
}

export function assembleBillingTotals(input: {
  month: number;
  year: number;
  sacCode: string;
  employeeCharges: number;
  pfContribution: number;
  pfWageBase: number;
  esicContribution: number;
  lwfAmount: number;
  serviceChargePct: number;
  pfPct: number;
  esicPct: number;
  lwfPct: number;
  enabledComponents: EnabledBillingComponent[];
  gstPct: number;
  gstType: string;
  companyState: string | null;
  clientState: string | null;
}): BillingEngineTotals {
  const enabled = new Set(
    input.enabledComponents.filter((c) => c.isEnabled).map((c) => c.code),
  );

  const manpowerBase = enabled.has('BASIC_CHARGES') ? round(input.employeeCharges) : 0;
  const pfContributionRaw = enabled.has('PF_CONTRIBUTION') ? round(input.pfContribution) : 0;
  const esicContributionRaw = enabled.has('ESIC_CONTRIBUTION') ? round(input.esicContribution) : 0;
  const lwfAmountRaw = enabled.has('LWF') ? round(input.lwfAmount) : 0;
  const serviceChargeRaw = enabled.has('SERVICE_CHARGES')
    ? computeServiceCharge(manpowerBase, input.serviceChargePct)
    : 0;

  const components = buildSignetTaxInvoiceLines({
    month: input.month,
    year: input.year,
    sacCode: input.sacCode,
    employeeCharges: manpowerBase,
    pfContribution: pfContributionRaw,
    pfWageBase: input.pfWageBase,
    esicContribution: esicContributionRaw,
    lwfAmount: lwfAmountRaw,
    serviceChargeAmount: serviceChargeRaw,
    pfPct: input.pfPct,
    esicPct: input.esicPct,
    lwfPct: input.lwfPct,
    serviceChargePct: input.serviceChargePct,
  }).filter((line) => enabled.has(line.componentCode));

  const lineAmount = (code: string) =>
    components.find((line) => line.componentCode === code)?.amount ?? 0;

  const employeeCharges = lineAmount(BILLING_COMPONENT_CODE.BASIC_CHARGES);
  const pfContribution = lineAmount(BILLING_COMPONENT_CODE.PF_CONTRIBUTION);
  const esicContribution = lineAmount(BILLING_COMPONENT_CODE.ESIC_CONTRIBUTION);
  const lwfAmount = lineAmount(BILLING_COMPONENT_CODE.LWF);
  const serviceChargeAmount = lineAmount(BILLING_COMPONENT_CODE.SERVICE_CHARGES);

  const taxableValue = components.reduce((sum, line) => sum + line.amount, 0);

  const tax = computeTaxBreakdown({
    taxableValue,
    gstPct: input.gstPct,
    gstType: input.gstType as 'cgst_sgst' | 'igst',
    companyState: input.companyState,
    clientState: input.clientState,
  });

  const grandTotal = Math.round(taxableValue + tax.gstAmount);

  return {
    employeeCharges,
    pfContribution,
    esicContribution,
    lwfAmount,
    serviceChargeAmount,
    otherCharges: 0,
    penaltyAmount: 0,
    adjustmentAmount: 0,
    discountAmount: 0,
    taxableValue,
    tax,
    grandTotal,
    components,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildValidationResult(input: {
  billingConfiguration: boolean;
  contractActive: boolean;
  attendanceProcessed: boolean;
  payrollProcessed: boolean;
  requirePayroll?: boolean;
  requireAttendance?: boolean;
}): BillingEngineValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.billingConfiguration) {
    errors.push('Billing configuration is missing for this site.');
  }
  if (!input.contractActive) {
    warnings.push('No active contract found for this client/site in the billing period.');
  }
  if (input.requireAttendance !== false && !input.attendanceProcessed) {
    errors.push('Attendance register is not locked/processed for this client and period.');
  }
  if (input.requirePayroll !== false && !input.payrollProcessed) {
    errors.push('Payroll is not processed for this billing period.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks: {
      billingConfiguration: input.billingConfiguration,
      contractActive: input.contractActive,
      attendanceProcessed: input.attendanceProcessed,
      payrollProcessed: input.payrollProcessed,
    },
  };
}
