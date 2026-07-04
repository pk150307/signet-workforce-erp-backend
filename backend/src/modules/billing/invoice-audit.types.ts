export interface InvoiceAuditLogDto {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  action: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  userId: string | null;
  userName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  browser: string | null;
  operatingSystem: string | null;
  createdAt: string;
  createdBy: string;
}

export interface InvoiceHistoryDto {
  id: string;
  invoiceId: string;
  versionNumber: number;
  changeType: string;
  changeSummary: string | null;
  snapshot: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
}

export interface InvoiceActivityEntry {
  id: string;
  type: 'audit' | 'status' | 'history';
  action: string;
  description: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  performedBy: string;
  performedAt: string;
}

export interface InvoiceAuditFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  page?: number;
  invoiceId?: string;
  action?: string;
  createdBy?: string;
  fromDate?: string;
  toDate?: string;
  clientId?: string;
  search?: string;
}

export interface LogInvoiceAuditInput {
  invoiceId: string;
  action: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  createdBy: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  operatingSystem?: string | null;
}
