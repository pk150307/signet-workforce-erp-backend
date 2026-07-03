export interface BillingComponentLine {
  componentCode: string;
  componentName: string;
  description: string;
  quantity: number;
  unitRate: number;
  amount: number;
  hsnSacCode: string;
  isTaxable: boolean;
  designationGradeId?: string;
  departmentId?: string;
}

export interface BillingTaxBreakdown {
  gstType: 'cgst_sgst' | 'igst';
  taxableValue: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
}

export interface BillingEngineValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    billingConfiguration: boolean;
    contractActive: boolean;
    attendanceProcessed: boolean;
    payrollProcessed: boolean;
  };
}

export interface BillingEngineContext {
  clientId: string;
  clientName: string;
  clientState: string | null;
  clientGstNumber: string | null;
  siteId: string;
  siteName: string;
  siteState: string | null;
  month: number;
  year: number;
  workingDays: number;
  companyState: string | null;
  billingConfigurationId: string | null;
  contractId: string | null;
  attendanceRegisterId: string | null;
  payrollRunId: string | null;
  billingType: string;
  serviceChargePct: number;
  gstPct: number;
  gstType: string;
  sacCode: string;
  natureOfService: string;
  invoiceNotes: string | null;
  pfPct: number;
  esicPct: number;
  lwfPct: number;
  enabledComponents: Array<{
    code: string;
    name: string;
    isEnabled: boolean;
    isTaxable: boolean;
    hsnSacCode: string;
    pctOverride: number | null;
    rateOverride: number | null;
  }>;
}

export interface BillingEngineCalculateInput {
  month: number;
  year: number;
  clientId: string;
  siteId: string;
  skipValidation?: boolean;
  requirePayroll?: boolean;
  requireAttendance?: boolean;
}

export interface BillingEngineValidationInput extends BillingEngineCalculateInput {}

export interface BillingEngineResult {
  clientId: string;
  clientName: string;
  siteId: string;
  siteName: string;
  month: number;
  year: number;
  workingDays: number;
  employeeCount: number;
  totalManDays: number;
  billingConfigurationId: string | null;
  contractId: string | null;
  attendanceRegisterId: string | null;
  payrollRunId: string | null;
  validation: BillingEngineValidation;
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
  lineItems: BillingComponentLine[];
  calculationSnapshot: Record<string, unknown>;
  alreadyInvoiced: boolean;
  placeOfSupply: string | null;
  natureOfService: string;
  sacCode: string;
}
