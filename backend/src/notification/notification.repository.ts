import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { NOTIFICATION_PRIORITY } from '../iam/iam.constants';
import {
  CreateNotificationInput,
  NotificationDetail,
  NotificationFilter,
  NotificationListItem,
  NotificationSummary,
} from './notification.types';

const SELECT_FIELDS = `
  n.id, n.title, n.message, n.is_read, n.read_at, n.link,
  n.notification_type, n.reference_type, n.reference_id, n.priority,
  n.created_at, n.created_by, n.updated_at, n.updated_by
`;

export class NotificationRepository {
  private buildConditions(filter: NotificationFilter): { where: string; params: unknown[] } {
    const conditions = ['NOT n.is_deleted', 'n.user_id = $1'];
    const params: unknown[] = [filter.userId];
    let i = 2;

    if (filter.unreadOnly) {
      conditions.push('NOT n.is_read');
    }
    if (filter.notificationType) {
      conditions.push(`n.notification_type = $${i++}`);
      params.push(filter.notificationType);
    }
    if (filter.referenceType) {
      conditions.push(`n.reference_type = $${i++}`);
      params.push(filter.referenceType);
    }
    if (filter.referenceId) {
      conditions.push(`n.reference_id = $${i++}`);
      params.push(filter.referenceId);
    }
    if (filter.priority) {
      conditions.push(`n.priority = $${i++}`);
      params.push(filter.priority);
    }
    if (filter.dateFrom) {
      conditions.push(`n.created_at >= $${i++}`);
      params.push(filter.dateFrom);
    }
    if (filter.dateTo) {
      conditions.push(`n.created_at <= $${i++}`);
      params.push(filter.dateTo);
    }
    if (filter.search) {
      conditions.push(
        `(LOWER(n.title) LIKE $${i} OR LOWER(n.message) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    return { where: conditions.join(' AND '), params };
  }

  private mapListItem(r: Record<string, unknown>): NotificationListItem {
    return {
      id: String(r.id),
      title: String(r.title),
      message: String(r.message),
      isRead: Boolean(r.is_read),
      readAt: r.read_at ? new Date(String(r.read_at)).toISOString() : null,
      link: r.link ? String(r.link) : null,
      notificationType: r.notification_type ? String(r.notification_type) : null,
      referenceType: r.reference_type ? String(r.reference_type) : null,
      referenceId: r.reference_id ? String(r.reference_id) : null,
      priority: String(r.priority ?? NOTIFICATION_PRIORITY.NORMAL),
      createdAt: new Date(String(r.created_at)).toISOString(),
      createdBy: String(r.created_by),
    };
  }

  private mapDetail(r: Record<string, unknown>): NotificationDetail {
    return {
      ...this.mapListItem(r),
      updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
      updatedBy: r.updated_by ? String(r.updated_by) : null,
    };
  }

  async findAll(filter: NotificationFilter): Promise<PaginatedResult<NotificationListItem>> {
    const { where, params } = this.buildConditions(filter);
    let i = params.length + 1;

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications n WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM notifications n
       WHERE ${where}
       ORDER BY n.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map((r) => this.mapListItem(r)),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async findById(id: string, userId: string): Promise<NotificationDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM notifications n
       WHERE n.id = $1 AND n.user_id = $2 AND NOT n.is_deleted`,
      [id, userId],
    );
    if (!rows[0]) return null;
    return this.mapDetail(rows[0]);
  }

  async getSummary(userId: string): Promise<NotificationSummary> {
    const totals = await query<{ total_count: string; unread_count: string }>(
      `SELECT
         COUNT(*) AS total_count,
         COUNT(*) FILTER (WHERE NOT is_read) AS unread_count
       FROM notifications
       WHERE user_id = $1 AND NOT is_deleted`,
      [userId],
    );

    const byType = await query<{
      notification_type: string;
      count: string;
      unread_count: string;
    }>(
      `SELECT
         COALESCE(notification_type, 'general') AS notification_type,
         COUNT(*) AS count,
         COUNT(*) FILTER (WHERE NOT is_read) AS unread_count
       FROM notifications
       WHERE user_id = $1 AND NOT is_deleted
       GROUP BY COALESCE(notification_type, 'general')
       ORDER BY count DESC`,
      [userId],
    );

    const row = totals.rows[0];
    return {
      totalCount: parseInt(row.total_count, 10),
      unreadCount: parseInt(row.unread_count, 10),
      byType: byType.rows.map((r) => ({
        notificationType: String(r.notification_type),
        count: parseInt(r.count, 10),
        unreadCount: parseInt(r.unread_count, 10),
      })),
    };
  }

  async create(input: CreateNotificationInput): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO notifications (
        user_id, title, message, link, notification_type, reference_type, reference_id,
        priority, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        input.userId,
        input.title,
        input.message,
        input.link ?? null,
        input.notificationType,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.priority ?? NOTIFICATION_PRIORITY.NORMAL,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async markRead(id: string, userId: string, updatedBy: string): Promise<boolean> {
    const result = await query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND user_id = $2 AND NOT is_deleted AND NOT is_read`,
      [id, userId, updatedBy],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string, updatedBy: string): Promise<number> {
    const result = await query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW(), updated_by = $2
       WHERE user_id = $1 AND NOT is_read AND NOT is_deleted`,
      [userId, updatedBy],
    );
    return result.rowCount ?? 0;
  }

  async markUnread(id: string, userId: string, updatedBy: string): Promise<boolean> {
    const result = await query(
      `UPDATE notifications
       SET is_read = FALSE, read_at = NULL, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND user_id = $2 AND NOT is_deleted AND is_read`,
      [id, userId, updatedBy],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async dismiss(id: string, userId: string, deletedBy: string): Promise<boolean> {
    const result = await query(
      `UPDATE notifications
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $3, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND user_id = $2 AND NOT is_deleted`,
      [id, userId, deletedBy],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const notificationRepository = new NotificationRepository();
