export interface InvoiceLineItemDto {
  id: string;
  description: string;
  quantity: number;
  unitRate: number;
  amount: number;
  hsnSacCode: string | null;
  componentCode?: string | null;
}

export interface InvoiceTaxLineDto {
  taxType: 'cgst' | 'sgst' | 'igst';
  taxRate: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface InvoicePrintCompany {
  companyName: string;
  legalName: string | null;
  address: string;
  city: string;
  state: string;
  pinCode: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  pfEstablishmentCode: string | null;
  esicCode: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
}

export interface InvoicePrintDto {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  month: number;
  year: number;
  status: number;
  statusLabel: string;
  isLocked: boolean;
  clientId: string;
  clientName: string;
  clientGstNumber: string | null;
  clientPanNumber: string | null;
  clientAddress: string | null;
  clientCity: string | null;
  clientState: string | null;
  placeOfSupply: string | null;
  siteId: string | null;
  siteName: string | null;
  siteCode: string | null;
  natureOfService: string;
  sacCode: string;
  lineItems: InvoiceLineItemDto[];
  employeeCharges: number;
  pfContribution: number;
  esicContribution: number;
  lwfAmount: number;
  serviceChargeAmount: number;
  taxableValue: number;
  subTotal: number;
  gstRate: number;
  gstAmount: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstType: 'cgst_sgst' | 'igst';
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  amountInWords: string;
  notes: string | null;
  termsAndConditions: string | null;
  taxLines: InvoiceTaxLineDto[];
  company: InvoicePrintCompany | null;
  qrPayload: string | null;
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
  billingAddress: string | null;
  clientGstNumber: string | null;
  clientCity: string | null;
  clientState: string | null;
  lineItems: InvoiceLineItemDto[];
  timeline: InvoiceTimelineEntry[];
  company: InvoicePrintCompany | null;
}

export interface GenerateSiteInvoicesInput {
  month: number;
  year: number;
  siteIds?: string[];
  siteId?: string;
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

export interface SuggestedInvoiceLineItem {
  departmentId: string;
  departmentName: string;
  description: string;
  quantity: number;
  unitRate: number;
  ratePerDay: number | null;
  ratePerMonth: number | null;
  hsnSacCode: string;
}

export interface UpdateInvoiceInput {
  invoiceDate?: string;
  dueDate?: string;
  gstRate?: number;
  notes?: string | null;
  termsAndConditions?: string | null;
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitRate: number;
    hsnSacCode?: string;
  }>;
  updatedBy: string;
}

export interface UpdateInvoiceStatusInput {
  status: number;
  paidAmount?: number;
  note?: string;
  updatedBy: string;
}

export interface InvoicePreviewDto {
  siteId: string;
  siteName: string;
  clientId: string;
  clientName: string;
  month: number;
  year: number;
  workingDays: number;
  employeeCount: number;
  totalManDays: number;
  totalOvertimeHours: number;
  totalEmployerPf: number;
  totalEmployerEsi: number;
  subTotal: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  alreadyInvoiced: boolean;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitRate: number;
    amount: number;
    hsnSacCode: string;
    category: 'manpower' | 'overtime' | 'night_allowance' | 'punctuality_award' | 'pf' | 'esi';
  }>;
}

export interface InvoiceTimelineEntry {
  id: string;
  action: string;
  description: string;
  performedBy: string;
  performedAt: string;
}
