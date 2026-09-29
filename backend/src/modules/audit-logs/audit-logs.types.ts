export interface AuditLogListItem {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  module: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  browser: string | null;
  operatingSystem: string | null;
  requestId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface AuditLogDetail extends AuditLogListItem {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  userAgent: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AuditLogFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  page?: number;
  userId?: string;
  module?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
  ipAddress?: string;
  search?: string;
}

export interface AuditLogSummary {
  totalLogs: number;
  last24Hours: number;
  last7Days: number;
  byModule: Array<{ module: string; count: number }>;
  byAction: Array<{ action: string; count: number }>;
}

export const AUDIT_LOG_EXPORT_MAX_ROWS = 10_000;

export const AUDIT_LOG_EXPORT_COLUMNS = [
  { key: 'createdAt', label: 'Created At' },
  { key: 'user', label: 'User' },
  { key: 'email', label: 'Email' },
  { key: 'module', label: 'Module' },
  { key: 'action', label: 'Action' },
  { key: 'entityType', label: 'Entity Type' },
  { key: 'entityId', label: 'Entity ID' },
  { key: 'ipAddress', label: 'IP Address' },
  { key: 'browser', label: 'Browser' },
  { key: 'operatingSystem', label: 'Operating System' },
  { key: 'createdBy', label: 'Created By' },
] as const;

export const AUDIT_LOG_EXPORT_HEADERS = AUDIT_LOG_EXPORT_COLUMNS.map((column) => column.label);

export const AUDIT_LOG_PDF_OMIT_HEADERS = ['Browser', 'Operating System'] as const;
