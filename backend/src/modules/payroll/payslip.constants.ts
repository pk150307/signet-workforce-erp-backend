export const PAYSLIP_STATUSES = [
  'draft',
  'generated',
  'sent',
  'downloaded',
  'failed',
  'cancelled',
] as const;

export type PayslipStatusValue = (typeof PAYSLIP_STATUSES)[number];

export const PAYSLIP_STATUS_LABELS: Record<PayslipStatusValue, string> = {
  draft: 'Draft',
  generated: 'Generated',
  sent: 'Sent',
  downloaded: 'Downloaded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const ALLOWED_PAYSLIP_TRANSITIONS: Record<PayslipStatusValue, PayslipStatusValue[]> = {
  draft: ['generated', 'cancelled'],
  generated: ['sent', 'downloaded', 'failed', 'cancelled'],
  sent: ['downloaded', 'failed', 'cancelled'],
  downloaded: [],
  failed: ['generated', 'cancelled'],
  cancelled: [],
};

export const PAYSLIP_DELETABLE_STATUSES: PayslipStatusValue[] = [
  'draft',
  'generated',
  'failed',
  'cancelled',
];

export function normalizePayslipStatus(value: string | undefined | null): PayslipStatusValue {
  const key = String(value ?? 'generated').toLowerCase() as PayslipStatusValue;
  return PAYSLIP_STATUSES.includes(key) ? key : 'generated';
}

export function toApiPayslipStatus(value: string | undefined | null): string {
  return PAYSLIP_STATUS_LABELS[normalizePayslipStatus(value)];
}

export function parsePayslipStatusInput(value: string): PayslipStatusValue | null {
  const normalized = value.toLowerCase();
  return PAYSLIP_STATUSES.includes(normalized as PayslipStatusValue)
    ? (normalized as PayslipStatusValue)
    : null;
}
