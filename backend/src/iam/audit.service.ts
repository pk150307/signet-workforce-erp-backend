import { query } from '../../database/pool';
import { AUDIT_ACTION } from './iam.constants';

export interface AuditLogInput {
  userId?: string | null;
  module: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  operatingSystem?: string | null;
  requestId?: string | null;
  createdBy?: string;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await query(
    `INSERT INTO audit_logs (
      user_id, module, action, entity_type, entity_id,
      old_values, new_values, ip_address, user_agent, browser, operating_system,
      request_id, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      input.userId ?? null,
      input.module,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.oldValues ? JSON.stringify(input.oldValues) : null,
      input.newValues ? JSON.stringify(input.newValues) : null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      input.browser ?? null,
      input.operatingSystem ?? null,
      input.requestId ?? null,
      input.createdBy ?? 'System',
    ],
  );
}

export { AUDIT_ACTION };
