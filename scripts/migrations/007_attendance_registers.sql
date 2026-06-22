-- Client-wise monthly attendance registers (manual month-end entry)

CREATE TABLE IF NOT EXISTS attendance_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(200),
  submitted_at TIMESTAMPTZ,
  submitted_by VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  UNIQUE (client_id, month, year)
);

CREATE TABLE IF NOT EXISTS attendance_register_unlock_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id UUID NOT NULL REFERENCES attendance_registers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  unlocked_by VARCHAR(200) NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_registers_client ON attendance_registers(client_id);
CREATE INDEX IF NOT EXISTS idx_attendance_registers_period ON attendance_registers(year, month);
