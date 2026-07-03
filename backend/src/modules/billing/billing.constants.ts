/** Billing engine component codes — maps to billing_components.code */
export const BILLING_COMPONENT_CODE = {
  BASIC_CHARGES: 'BASIC_CHARGES',
  PF_CONTRIBUTION: 'PF_CONTRIBUTION',
  ESIC_CONTRIBUTION: 'ESIC_CONTRIBUTION',
  LWF: 'LWF',
  SERVICE_CHARGES: 'SERVICE_CHARGES',
  OTHER_CHARGES: 'OTHER_CHARGES',
  PENALTY: 'PENALTY',
  ADJUSTMENT: 'ADJUSTMENT',
  DISCOUNT: 'DISCOUNT',
} as const;

export type BillingComponentCode = (typeof BILLING_COMPONENT_CODE)[keyof typeof BILLING_COMPONENT_CODE];

export const BILLING_TYPE = {
  MONTHLY: 'monthly',
  DAILY: 'daily',
  HOURLY: 'hourly',
} as const;

export const BILLING_CYCLE = {
  MONTHLY: 'monthly',
  BIWEEKLY: 'biweekly',
  WEEKLY: 'weekly',
} as const;

export const GST_TYPE = {
  CGST_SGST: 'cgst_sgst',
  IGST: 'igst',
} as const;

export const CONTRACT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  TERMINATED: 'terminated',
  CANCELLED: 'cancelled',
} as const;

export const INVOICE_TYPE = {
  STANDARD: 'standard',
  CREDIT_NOTE: 'credit_note',
  DEBIT_NOTE: 'debit_note',
  REVISION: 'revision',
} as const;

export const PAYMENT_MODE = {
  CHEQUE: 'cheque',
  NEFT: 'neft',
  RTGS: 'rtgs',
  UPI: 'upi',
  CASH: 'cash',
  OTHER: 'other',
} as const;

/** Extends InvoiceStatus enum in types/enums.ts */
export const EXTENDED_INVOICE_STATUS = {
  Generated: 8,
  Approved: 9,
  Archived: 10,
} as const;

/** Default invoice series format: 44/26-27 */
export const DEFAULT_INVOICE_SERIES_FORMAT = '{seq}/{fy_short}';

/** Signet tax-invoice statutory defaults (per standard billing template). */
export const BILLING_STATUTORY_DEFAULTS = {
  PF_PCT: 13,
  ESIC_PCT: 3.25,
  LWF_PCT: 0.4,
  SERVICE_CHARGE_PCT: 6,
  GST_PCT: 18,
} as const;

/** LWF wage base = PF wage + this factor × (manpower − PF wage). */
export const LWF_WAGE_BLEND_FACTOR = 0.697;
