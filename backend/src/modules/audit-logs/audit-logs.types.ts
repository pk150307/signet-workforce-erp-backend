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
  page: number;
  pageSize: number;
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

export const AUDIT_LOG_EXPORT_HEADERS = [
  'Created At',
  'User',
  'Email',
  'Module',
  'Action',
  'Entity Type',
  'Entity ID',
  'IP Address',
  'Browser',
  'Operating System',
  'Created By',
] as const;
