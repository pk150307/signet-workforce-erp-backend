-- Store device fingerprints separately from device category (desktop/mobile/tablet).
-- Successful logins previously wrote the full fingerprint (including IPv6) into device_type VARCHAR(50).

ALTER TABLE login_history
  ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_login_history_device_fingerprint
  ON login_history(user_id, device_fingerprint)
  WHERE NOT is_deleted AND login_status = 'success';
