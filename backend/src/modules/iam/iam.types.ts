/** Row shapes for IAM tables (migration 020_iam_schema.sql). */

export interface IamAuditColumns {
  status: string;
  created_at: Date;
  created_by: string;
  updated_at: Date | null;
  updated_by: string | null;
  is_deleted: boolean;
  deleted_at: Date | null;
  deleted_by: string | null;
}

export interface IamUserRow extends IamAuditColumns {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  mobile: string | null;
  profile_photo_url: string | null;
  employee_id: string | null;
  department_id: string | null;
  company_id: string | null;
  tenant_id: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  last_login_at: Date | null;
  last_login_ip: string | null;
  failed_login_attempts: number;
  locked_until: Date | null;
  account_locked: boolean;
  password_expires_at: Date | null;
  force_password_reset: boolean;
  refresh_token: string | null;
  refresh_token_expiry: Date | null;
  password_reset_token: string | null;
  password_reset_token_expiry: Date | null;
  email_verification_token: string | null;
  email_verification_token_expiry: Date | null;
}

export interface PasswordHistoryRow extends IamAuditColumns {
  id: string;
  user_id: string;
  password_hash: string;
  changed_at: Date;
}

export interface UserSessionRow extends IamAuditColumns {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  device_fingerprint: string | null;
  started_at: Date;
  last_activity_at: Date;
  expires_at: Date;
  ended_at: Date | null;
  is_active: boolean;
  remember_me: boolean;
  logout_reason: string | null;
  company_id: string | null;
  tenant_id: string | null;
}

export interface RefreshTokenRow extends IamAuditColumns {
  id: string;
  user_id: string;
  session_id: string | null;
  token_hash: string;
  expires_at: Date;
  remember_me: boolean;
  revoked_at: Date | null;
  is_revoked: boolean;
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  last_used_at: Date | null;
  company_id: string | null;
  tenant_id: string | null;
}

export interface PasswordResetTokenRow extends IamAuditColumns {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  is_used: boolean;
  requested_ip: string | null;
  used_ip: string | null;
  company_id: string | null;
  tenant_id: string | null;
}

export interface LoginHistoryRow extends IamAuditColumns {
  id: string;
  user_id: string | null;
  session_id: string | null;
  email_attempted: string | null;
  login_status: string;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  is_new_device: boolean;
  logged_in_at: Date;
  logged_out_at: Date | null;
  company_id: string | null;
  tenant_id: string | null;
}

export interface DeleteRequestRow extends IamAuditColumns {
  id: string;
  module: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  reason: string;
  requested_by: string;
  reviewed_by: string | null;
  rejection_remarks: string | null;
  reviewed_at: Date | null;
  soft_deleted_at: Date | null;
  entity_snapshot: Record<string, unknown> | null;
  company_id: string | null;
  tenant_id: string | null;
}

export interface AuditLogRow extends IamAuditColumns {
  id: string;
  user_id: string | null;
  module: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  browser: string | null;
  operating_system: string | null;
  request_id: string | null;
  company_id: string | null;
  tenant_id: string | null;
}

export interface NotificationRow extends IamAuditColumns {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  read_at: Date | null;
  link: string | null;
  notification_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  priority: string;
  company_id: string | null;
  tenant_id: string | null;
}
