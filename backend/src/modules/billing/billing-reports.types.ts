export interface BillingReportFilter {
  month?: number;
  year?: number;
  clientId?: string;
  siteId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface BillingOutstandingFilter extends BillingReportFilter {
  asOfDate?: string;
  page?: number;
  pageSize?: number;
}

export interface BillingCollectionsFilter extends BillingReportFilter {
  paymentMode?: string;
  page?: number;
  pageSize?: number;
}

export interface BillingGstFilter extends BillingReportFilter {}

export interface BillingPeriodSummaryDto {
  month: number;
  year: number;
  invoiceCount: number;
  totalBilled: number;
  totalCollected: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  collectionRate: number;
  taxableValue: number;
  totalGst: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
}

export interface OutstandingInvoiceRow {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  siteId: string | null;
  siteName: string | null;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  daysOverdue: number;
  agingBucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  status: number;
}

export interface OutstandingReportDto {
  asOfDate: string;
  summary: {
    invoiceCount: number;
    totalOutstanding: number;
    current: number;
    days1To30: number;
    days31To60: number;
    days61To90: number;
    days90Plus: number;
  };
  items: OutstandingInvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CollectionPaymentRow {
  id: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  referenceNumber: string | null;
  utrNumber: string | null;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
}

export interface CollectionsReportDto {
  fromDate: string;
  toDate: string;
  summary: {
    paymentCount: number;
    totalCollected: number;
    byMode: Array<{ paymentMode: string; count: number; amount: number }>;
    byClient: Array<{ clientId: string; clientName: string; count: number; amount: number }>;
  };
  items: CollectionPaymentRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GstClientBreakdown {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGst: number;
  grandTotal: number;
}

export interface GstReportDto {
  period: { month?: number; year?: number; fromDate?: string; toDate?: string };
  summary: {
    invoiceCount: number;
    taxableValue: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalGst: number;
    grandTotal: number;
    igstInvoiceCount: number;
    cgstSgstInvoiceCount: number;
  };
  byClient: GstClientBreakdown[];
}
