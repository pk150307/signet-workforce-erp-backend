import {
  assembleBillingTotals,
  buildValidationResult,
  computeServiceCharge,
  computeTaxBreakdown,
  resolveGstType,
} from '../modules/billing/billing-engine.calculation';
import { buildSignetTaxInvoiceLines, formatBillingPeriodShort } from '../modules/billing/billing-engine.invoice-lines';

describe('billing-engine.calculation', () => {
  describe('resolveGstType', () => {
    it('returns igst when configured as igst', () => {
      expect(resolveGstType('igst', 'Maharashtra', 'Maharashtra')).toBe('igst');
    });

    it('honours configured cgst_sgst for same state', () => {
      expect(resolveGstType('cgst_sgst', 'Maharashtra', 'Maharashtra')).toBe('cgst_sgst');
    });

    it('honours configured cgst_sgst even across different states', () => {
      expect(resolveGstType('cgst_sgst', 'Maharashtra', 'Karnataka')).toBe('cgst_sgst');
    });

    it('auto-detects cgst_sgst from matching states when type is unset', () => {
      expect(resolveGstType('auto', 'Maharashtra', 'Maharashtra')).toBe('cgst_sgst');
    });

    it('auto-detects igst from differing states when type is unset', () => {
      expect(resolveGstType('auto', 'Maharashtra', 'Karnataka')).toBe('igst');
    });
  });

  describe('computeTaxBreakdown', () => {
    it('splits GST into CGST and SGST for intra-state', () => {
      const tax = computeTaxBreakdown({
        taxableValue: 100000,
        gstPct: 18,
        gstType: 'cgst_sgst',
        companyState: 'Maharashtra',
        clientState: 'Maharashtra',
      });

      expect(tax.gstType).toBe('cgst_sgst');
      expect(tax.cgstRate).toBe(9);
      expect(tax.sgstRate).toBe(9);
      expect(tax.cgstAmount).toBe(9000);
      expect(tax.sgstAmount).toBe(9000);
      expect(tax.igstAmount).toBe(0);
      expect(tax.gstAmount).toBe(18000);
    });

    it('applies IGST when configured as igst', () => {
      const tax = computeTaxBreakdown({
        taxableValue: 50000,
        gstPct: 18,
        gstType: 'igst',
        companyState: 'Maharashtra',
        clientState: 'Delhi',
      });

      expect(tax.gstType).toBe('igst');
      expect(tax.igstRate).toBe(18);
      expect(tax.igstAmount).toBe(9000);
      expect(tax.cgstAmount).toBe(0);
      expect(tax.sgstAmount).toBe(0);
    });

    it('keeps CGST+SGST across states when explicitly configured', () => {
      const tax = computeTaxBreakdown({
        taxableValue: 50000,
        gstPct: 18,
        gstType: 'cgst_sgst',
        companyState: 'Maharashtra',
        clientState: 'Delhi',
      });

      expect(tax.gstType).toBe('cgst_sgst');
      expect(tax.cgstAmount).toBe(4500);
      expect(tax.sgstAmount).toBe(4500);
      expect(tax.igstAmount).toBe(0);
    });
  });

  describe('computeServiceCharge', () => {
    it('returns zero when base or percentage is zero', () => {
      expect(computeServiceCharge(0, 10)).toBe(0);
      expect(computeServiceCharge(1000, 0)).toBe(0);
    });

    it('calculates percentage of manpower base only', () => {
      expect(computeServiceCharge(100000, 6)).toBe(6000);
    });
  });

  describe('assembleBillingTotals', () => {
    const enabledComponents = [
      { code: 'BASIC_CHARGES', name: 'Basic', isEnabled: true, isTaxable: true, hsnSacCode: '998519', pctOverride: null, rateOverride: null },
      { code: 'PF_CONTRIBUTION', name: 'PF', isEnabled: true, isTaxable: true, hsnSacCode: '998519', pctOverride: null, rateOverride: null },
      { code: 'ESIC_CONTRIBUTION', name: 'ESIC', isEnabled: true, isTaxable: true, hsnSacCode: '998519', pctOverride: null, rateOverride: null },
      { code: 'LWF', name: 'LWF', isEnabled: true, isTaxable: true, hsnSacCode: '998519', pctOverride: null, rateOverride: null },
      { code: 'SERVICE_CHARGES', name: 'Service', isEnabled: true, isTaxable: true, hsnSacCode: '998519', pctOverride: null, rateOverride: null },
    ];

    it('computes Signet-style taxable value with service charge on manpower', () => {
      const result = assembleBillingTotals({
        month: 5,
        year: 2026,
        sacCode: '998519',
        employeeCharges: 80000,
        pfContribution: 5000,
        pfWageBase: 40000,
        esicContribution: 2600,
        lwfAmount: 200,
        serviceChargePct: 6,
        pfPct: 13,
        esicPct: 3.25,
        lwfPct: 0.4,
        enabledComponents,
        gstPct: 18,
        gstType: 'cgst_sgst',
        companyState: 'Maharashtra',
        clientState: 'Maharashtra',
      });

      expect(result.employeeCharges).toBe(80000);
      expect(result.pfContribution).toBe(5000);
      expect(result.serviceChargeAmount).toBe(4800);
      expect(result.taxableValue).toBe(92600);
      expect(result.components).toHaveLength(5);
      expect(result.components[0].description).toContain('MAY-26');
      expect(result.grandTotal).toBe(Math.round(92600 + result.tax.gstAmount));
    });

    it('excludes disabled components from totals', () => {
      const result = assembleBillingTotals({
        month: 5,
        year: 2026,
        sacCode: '998519',
        employeeCharges: 50000,
        pfContribution: 3000,
        pfWageBase: 25000,
        esicContribution: 1000,
        lwfAmount: 200,
        serviceChargePct: 5,
        pfPct: 13,
        esicPct: 3.25,
        lwfPct: 0.4,
        enabledComponents: enabledComponents.map((c) =>
          c.code === 'PF_CONTRIBUTION' ? { ...c, isEnabled: false } : c,
        ),
        gstPct: 18,
        gstType: 'cgst_sgst',
        companyState: 'Maharashtra',
        clientState: 'Maharashtra',
      });

      expect(result.pfContribution).toBe(0);
      expect(result.taxableValue).toBe(53700);
    });

    it('taxable value equals the sum of rounded invoice line amounts', () => {
      const result = assembleBillingTotals({
        month: 5,
        year: 2026,
        sacCode: '998519',
        employeeCharges: 39343,
        pfContribution: 3510.65,
        pfWageBase: 27005,
        esicContribution: 1278.65,
        lwfAmount: 134,
        serviceChargePct: 6,
        pfPct: 13,
        esicPct: 3.25,
        lwfPct: 0.4,
        enabledComponents,
        gstPct: 18,
        gstType: 'cgst_sgst',
        companyState: 'Maharashtra',
        clientState: 'Maharashtra',
      });

      const lineSum = result.components.reduce((sum, line) => sum + line.amount, 0);
      expect(lineSum).toBe(46628);
      expect(result.taxableValue).toBe(lineSum);
      expect(result.grandTotal).toBe(Math.round(result.taxableValue + result.tax.gstAmount));
    });
  });

  describe('buildSignetTaxInvoiceLines', () => {
    it('formats EPF line with percentage and base', () => {
      const lines = buildSignetTaxInvoiceLines({
        month: 5,
        year: 2026,
        sacCode: '998519',
        employeeCharges: 1203641,
        pfContribution: 109277,
        pfWageBase: 840592,
        esicContribution: 39118,
        lwfAmount: 4375,
        serviceChargeAmount: 72218,
        pfPct: 13,
        esicPct: 3.25,
        lwfPct: 0.4,
        serviceChargePct: 6,
      });

      expect(lines).toHaveLength(5);
      expect(lines[0].description).toBe(`Manpower Arrangement Charges M/o. ${formatBillingPeriodShort(5, 2026)}`);
      expect(lines[1].description).toContain('EPF Contribution@ 13%');
      expect(lines[1].description).toContain('8,40,592');
      expect(lines[4].description).toContain('Service Charge @ 6%');
    });
  });

  describe('buildValidationResult', () => {
    it('marks valid when required checks pass', () => {
      const result = buildValidationResult({
        billingConfiguration: true,
        contractActive: true,
        attendanceProcessed: true,
        payrollProcessed: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('collects errors for missing prerequisites', () => {
      const result = buildValidationResult({
        billingConfiguration: false,
        contractActive: false,
        attendanceProcessed: false,
        payrollProcessed: false,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.warnings.some((w) => w.includes('contract'))).toBe(true);
    });

    it('allows skipping payroll and attendance validation', () => {
      const result = buildValidationResult({
        billingConfiguration: true,
        contractActive: true,
        attendanceProcessed: false,
        payrollProcessed: false,
        requirePayroll: false,
        requireAttendance: false,
      });

      expect(result.valid).toBe(true);
    });
  });
});
