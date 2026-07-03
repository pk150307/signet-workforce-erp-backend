import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { LoginHistoryFilter, LoginHistoryItem, LoginHistorySummary } from './login-history.types';

function mapRow(r: Record<string, unknown>): LoginHistoryItem {
  return {
    id: String(r.id),
    userId: r.user_id ? String(r.user_id) : null,
    userEmail: r.user_email ? String(r.user_email) : null,
    userName: r.user_name ? String(r.user_name) : null,
    emailAttempted: r.email_attempted ? String(r.email_attempted) : null,
    loginStatus: String(r.login_status),
    failureReason: r.failure_reason ? String(r.failure_reason) : null,
    ipAddress: r.ip_address ? String(r.ip_address) : null,
    userAgent: r.user_agent ? String(r.user_agent) : null,
    browser: r.browser ? String(r.browser) : null,
    operatingSystem: r.operating_system ? String(r.operating_system) : null,
    deviceType: r.device_type ? String(r.device_type) : null,
    isNewDevice: Boolean(r.is_new_device),
    loggedInAt: new Date(String(r.logged_in_at)).toISOString(),
    loggedOutAt: r.logged_out_at ? new Date(String(r.logged_out_at)).toISOString() : null,
  };
}

const SELECT_FIELDS = `
  lh.id, lh.user_id, lh.email_attempted, lh.login_status, lh.failure_reason,
  lh.ip_address, lh.user_agent, lh.browser, lh.operating_system, lh.device_type,
  lh.is_new_device, lh.logged_in_at, lh.logged_out_at,
  u.email AS user_email,
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.full_name, u.username) AS user_name
`;

export class LoginHistoryRepository {
  private buildConditions(filter: LoginHistoryFilter): { where: string; params: unknown[] } {
    const conditions = ['NOT lh.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.userId) {
      conditions.push(`lh.user_id = $${i++}`);
      params.push(filter.userId);
    }

    if (filter.loginStatus) {
      conditions.push(`lh.login_status = $${i++}`);
      params.push(filter.loginStatus);
    }

    if (filter.dateFrom) {
      conditions.push(`lh.logged_in_at >= $${i++}`);
      params.push(filter.dateFrom);
    }

    if (filter.dateTo) {
      conditions.push(`lh.logged_in_at <= $${i++}`);
      params.push(filter.dateTo);
    }

    if (filter.isNewDevice !== undefined) {
      conditions.push(`lh.is_new_device = $${i++}`);
      params.push(filter.isNewDevice);
    }

    if (filter.search) {
      conditions.push(
        `(LOWER(COALESCE(u.email, '')) LIKE $${i}
          OR LOWER(COALESCE(lh.email_attempted, '')) LIKE $${i}
          OR COALESCE(lh.ip_address, '') LIKE $${i}
          OR LOWER(COALESCE(u.username, '')) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    return { where: conditions.join(' AND '), params };
  }

  async findAll(filter: LoginHistoryFilter): Promise<PaginatedResult<LoginHistoryItem>> {
    const { where, params } = this.buildConditions(filter);
    let i = params.length + 1;

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM login_history lh
       LEFT JOIN users u ON u.id = lh.user_id
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${SELECT_FIELDS}
       FROM login_history lh
       LEFT JOIN users u ON u.id = lh.user_id AND NOT u.is_deleted
       WHERE ${where}
       ORDER BY lh.logged_in_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map(mapRow),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async getSummary(userId?: string): Promise<LoginHistorySummary> {
    const conditions = ['NOT is_deleted'];
    const params: unknown[] = [];
    if (userId) {
      conditions.push('user_id = $1');
      params.push(userId);
    }
    const where = conditions.join(' AND ');

    const { rows } = await query<{
      total_logins: string;
      failed_attempts: string;
      locked_events: string;
      new_device_logins: string;
      last_login_at: Date | null;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE login_status = 'success')::text AS total_logins,
        COUNT(*) FILTER (WHERE login_status = 'failed')::text AS failed_attempts,
        COUNT(*) FILTER (WHERE login_status = 'locked')::text AS locked_events,
        COUNT(*) FILTER (WHERE login_status = 'success' AND is_new_device)::text AS new_device_logins,
        MAX(logged_in_at) FILTER (WHERE login_status = 'success') AS last_login_at
       FROM login_history
       WHERE ${where}`,
      params,
    );

    const row = rows[0];
    return {
      totalLogins: parseInt(row?.total_logins ?? '0', 10),
      failedAttempts: parseInt(row?.failed_attempts ?? '0', 10),
      lockedEvents: parseInt(row?.locked_events ?? '0', 10),
      newDeviceLogins: parseInt(row?.new_device_logins ?? '0', 10),
      lastLoginAt: row?.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    };
  }

  async closeSessionLogin(sessionId: string): Promise<void> {
    await query(
      `UPDATE login_history
       SET logged_out_at = NOW(), updated_at = NOW()
       WHERE session_id = $1
         AND login_status = 'success'
         AND logged_out_at IS NULL
         AND NOT is_deleted`,
      [sessionId],
    );
  }
}

export const loginHistoryRepository = new LoginHistoryRepository();
