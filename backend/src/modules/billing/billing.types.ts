export interface InvoiceLineItemDto {
  id: string;
  description: string;
  quantity: number;
  unitRate: number;
  amount: number;
  hsnSacCode: string | null;
}

export interface InvoiceDetailDto {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  siteId: string | null;
  siteName: string | null;
  siteCode: string | null;
  invoiceDate: string;
  dueDate: string;
  month: number;
  year: number;
  subTotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: number;
  notes: string | null;
  termsAndConditions: string | null;
  lineItems: InvoiceLineItemDto[];
}

export interface GenerateSiteInvoicesInput {
  month: number;
  year: number;
  siteIds?: string[];
  gstRate?: number;
  dueDateDays?: number;
  notes?: string;
  createdBy: string;
}

export interface CreateSiteInvoiceInput {
  siteId: string;
  month: number;
  year: number;
  invoiceDate: string;
  dueDate: string;
  gstRate: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitRate: number;
    hsnSacCode?: string;
  }>;
  notes?: string;
  termsAndConditions?: string;
  createdBy: string;
}

export interface GeneratedSiteInvoice {
  siteId: string;
  siteName: string;
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: number;
}
