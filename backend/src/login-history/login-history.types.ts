export interface LoginHistoryItem {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  emailAttempted: string | null;
  loginStatus: string;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string | null;
  isNewDevice: boolean;
  loggedInAt: string;
  loggedOutAt: string | null;
}

export interface LoginHistoryFilter {
  page: number;
  pageSize: number;
  userId?: string;
  loginStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  isNewDevice?: boolean;
}

export interface LoginHistorySummary {
  totalLogins: number;
  failedAttempts: number;
  lockedEvents: number;
  newDeviceLogins: number;
  lastLoginAt: string | null;
}
