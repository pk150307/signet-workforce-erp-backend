export type PaymentMode = 'cheque' | 'neft' | 'rtgs' | 'upi' | 'cash' | 'other';

export const PAYMENT_MODES: PaymentMode[] = ['cheque', 'neft', 'rtgs', 'upi', 'cash', 'other'];

export interface InvoicePaymentDto {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  paymentDate: string;
  amount: number;
  referenceNumber: string | null;
  utrNumber: string | null;
  paymentMode: PaymentMode;
  remarks: string | null;
  createdAt: string;
  createdBy: string;
}

export interface RecordInvoicePaymentInput {
  paymentDate: string;
  amount: number;
  referenceNumber?: string | null;
  utrNumber?: string | null;
  paymentMode?: PaymentMode;
  remarks?: string | null;
  createdBy: string;
}

export interface UpdateInvoicePaymentInput {
  paymentDate?: string;
  amount?: number;
  referenceNumber?: string | null;
  utrNumber?: string | null;
  paymentMode?: PaymentMode;
  remarks?: string | null;
  updatedBy: string;
}

export interface InvoicePaymentFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  page?: number;
  invoiceId?: string;
  clientId?: string;
  paymentMode?: PaymentMode;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

export interface InvoicePaymentSummaryDto {
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentCount: number;
  status: number;
  statusLabel: string;
}
