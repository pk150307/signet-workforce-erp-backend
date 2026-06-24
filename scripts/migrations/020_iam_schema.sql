-- Signet Workforce ERP — Identity & Access Management (IAM) schema
-- Milestone 1: users extensions, sessions, tokens, delete workflow, audit/notifications

-- ---------------------------------------------------------------------------
-- Users — extended profile & security fields
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mobile VARCHAR(20),
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(500),
  ADD COLUMN IF NOT EXISTS email_verification_token_expiry TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Backfill name fields from legacy full_name
UPDATE users
SET
  first_name = COALESCE(
    NULLIF(TRIM(first_name), ''),
    NULLIF(TRIM(split_part(COALESCE(full_name, ''), ' ', 1)), '')
  ),
  last_name = COALESCE(
    NULLIF(TRIM(last_name), ''),
    NULLIF(
      TRIM(
        CASE
          WHEN position(' ' IN COALESCE(full_name, '')) > 0
            THEN substring(full_name FROM position(' ' IN full_name) + 1)
          ELSE ''
        END
      ),
      ''
    )
  )
WHERE COALESCE(full_name, '') <> ''
  AND (first_name IS NULL OR last_name IS NULL);

CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile) WHERE NOT is_deleted AND mobile IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id) WHERE NOT is_deleted AND company_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Password history (prevent password reuse)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(500) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_password_history_user
  ON password_history(user_id, changed_at DESC)
  WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- User sessions (JWT / refresh session tracking)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(50),
  user_agent TEXT,
  browser VARCHAR(100),
  operating_system VARCHAR(100),
  device_type VARCHAR(50),
  device_fingerprint VARCHAR(255),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  remember_me BOOLEAN NOT NULL DEFAULT FALSE,
  logout_reason VARCHAR(100),
  company_id UUID REFERENCES clients(id),
  tenant_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions(user_id, is_active)
  WHERE NOT is_deleted AND is_active;

CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
  ON user_sessions(expires_at)
  WHERE NOT is_deleted AND is_active;

-- ---------------------------------------------------------------------------
-- Refresh tokens (multi-session, rotation-ready)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
  token_hash VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  remember_me BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  device_name VARCHAR(200),
  ip_address VARCHAR(50),
  user_agent TEXT,
  last_used_at TIMESTAMPTZ,
  company_id UUID REFERENCES clients(id),
  tenant_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200),
  CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens(user_id)
  WHERE NOT is_deleted AND NOT is_revoked;

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session
  ON refresh_tokens(session_id)
  WHERE NOT is_deleted AND session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Password reset tokens (hashed, single-use, expiring)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  requested_ip VARCHAR(50),
  used_ip VARCHAR(50),
  company_id UUID REFERENCES clients(id),
  tenant_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON password_reset_tokens(user_id, created_at DESC)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_active
  ON password_reset_tokens(token_hash)
  WHERE NOT is_deleted AND NOT is_used;

-- ---------------------------------------------------------------------------
-- Login history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  email_attempted VARCHAR(200),
  login_status VARCHAR(50) NOT NULL,
  failure_reason VARCHAR(200),
  ip_address VARCHAR(50),
  user_agent TEXT,
  browser VARCHAR(100),
  operating_system VARCHAR(100),
  device_type VARCHAR(50),
  is_new_device BOOLEAN NOT NULL DEFAULT FALSE,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_out_at TIMESTAMPTZ,
  company_id UUID REFERENCES clients(id),
  tenant_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_login_history_user
  ON login_history(user_id, logged_in_at DESC)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_login_history_status
  ON login_history(login_status, logged_in_at DESC)
  WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- Delete approval workflow
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delete_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  entity_label VARCHAR(500),
  reason TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  rejection_remarks TEXT,
  reviewed_at TIMESTAMPTZ,
  soft_deleted_at TIMESTAMPTZ,
  entity_snapshot JSONB,
  company_id UUID REFERENCES clients(id),
  tenant_id UUID,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_delete_requests_status
  ON delete_requests(status, created_at DESC)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_delete_requests_module
  ON delete_requests(module, entity_type, entity_id)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_delete_requests_requester
  ON delete_requests(requested_by, created_at DESC)
  WHERE NOT is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delete_requests_pending_entity
  ON delete_requests(module, entity_type, entity_id)
  WHERE NOT is_deleted AND status = 'pending';

-- ---------------------------------------------------------------------------
-- Audit logs — extended metadata
-- ---------------------------------------------------------------------------

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS module VARCHAR(100),
  ADD COLUMN IF NOT EXISTS browser VARCHAR(100),
  ADD COLUMN IF NOT EXISTS operating_system VARCHAR(100),
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

CREATE INDEX IF NOT EXISTS idx_audit_logs_module
  ON audit_logs(module, created_at DESC)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON audit_logs(user_id, created_at DESC)
  WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- Notifications — typed references for IAM events
-- ---------------------------------------------------------------------------

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_notifications_reference
  ON notifications(reference_type, reference_id)
  WHERE NOT is_deleted AND reference_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- IAM permissions & HR Manager system role
-- ---------------------------------------------------------------------------

INSERT INTO permissions (module, resource, action, description, created_by)
VALUES
  ('Users', 'Users', 'Create', 'Create users', 'System'),
  ('Users', 'Users', 'Read', 'View users', 'System'),
  ('Users', 'Users', 'Update', 'Update users', 'System'),
  ('Users', 'Users', 'Delete', 'Delete users', 'System'),
  ('Users', 'Users', 'Export', 'Export users', 'System'),
  ('Users', 'Users', 'Approve', 'Approve user actions', 'System'),
  ('Roles', 'Roles', 'Create', 'Create roles', 'System'),
  ('Roles', 'Roles', 'Read', 'View roles', 'System'),
  ('Roles', 'Roles', 'Update', 'Update roles', 'System'),
  ('Roles', 'Roles', 'Delete', 'Delete roles', 'System'),
  ('Roles', 'Roles', 'Export', 'Export roles', 'System'),
  ('Roles', 'Roles', 'Approve', 'Approve role changes', 'System'),
  ('DeleteRequests', 'DeleteRequests', 'Create', 'Submit delete requests', 'System'),
  ('DeleteRequests', 'DeleteRequests', 'Read', 'View delete requests', 'System'),
  ('DeleteRequests', 'DeleteRequests', 'Update', 'Update delete requests', 'System'),
  ('DeleteRequests', 'DeleteRequests', 'Delete', 'Cancel delete requests', 'System'),
  ('DeleteRequests', 'DeleteRequests', 'Export', 'Export delete requests', 'System'),
  ('DeleteRequests', 'DeleteRequests', 'Approve', 'Approve or reject delete requests', 'System'),
  ('Audit', 'Audit', 'Create', 'Create audit entries', 'System'),
  ('Audit', 'Audit', 'Read', 'View audit logs', 'System'),
  ('Audit', 'Audit', 'Update', 'Update audit entries', 'System'),
  ('Audit', 'Audit', 'Delete', 'Delete audit entries', 'System'),
  ('Audit', 'Audit', 'Export', 'Export audit logs', 'System'),
  ('Audit', 'Audit', 'Approve', 'Approve audit actions', 'System')
ON CONFLICT (module, resource, action) DO NOTHING;

-- Grant new IAM permissions to Super Admin
INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 'System'
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Super Admin'
  AND p.module IN ('Users', 'Roles', 'DeleteRequests', 'Audit')
  AND NOT r.is_deleted
  AND NOT p.is_deleted
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- HR Manager — operational ERP access (no Users/Roles/Audit admin)
INSERT INTO roles (name, description, is_system, is_active, created_by)
VALUES (
  'HR Manager',
  'Operational ERP access with delete approval workflow',
  TRUE,
  TRUE,
  'System'
)
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    is_system = EXCLUDED.is_system,
    is_active = EXCLUDED.is_active;

INSERT INTO role_permissions (role_id, permission_id, created_by)
SELECT r.id, p.id, 'System'
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'HR Manager'
  AND NOT r.is_deleted
  AND NOT p.is_deleted
  AND (
    (p.module = 'DeleteRequests' AND p.action IN ('Create', 'Read'))
    OR (
      p.module IN (
        'Employees', 'Clients', 'Sites', 'Attendance', 'Leave',
        'Payroll', 'Billing', 'Reports', 'Dashboard'
      )
      AND p.action IN ('Create', 'Read', 'Update', 'Delete', 'Export', 'Approve')
    )
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
