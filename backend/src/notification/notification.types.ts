export interface NotificationListItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  link: string | null;
  notificationType: string | null;
  referenceType: string | null;
  referenceId: string | null;
  priority: string;
  createdAt: string;
  createdBy: string;
}

export interface NotificationDetail extends NotificationListItem {
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface NotificationFilter {
  page: number;
  pageSize: number;
  userId: string;
  unreadOnly?: boolean;
  notificationType?: string;
  referenceType?: string;
  referenceId?: string;
  priority?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface NotificationSummary {
  totalCount: number;
  unreadCount: number;
  byType: Array<{ notificationType: string; count: number; unreadCount: number }>;
}

export interface CreateNotificationInput {
  userId: string;
  title: string;
  message: string;
  link?: string | null;
  notificationType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  priority?: string;
  createdBy: string;
}
