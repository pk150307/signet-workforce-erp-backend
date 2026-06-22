-- Monthly overtime hours captured per employee in attendance register

CREATE TABLE IF NOT EXISTS attendance_register_employee_overtime (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id UUID NOT NULL REFERENCES attendance_registers(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  overtime_hours NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  UNIQUE (register_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_register_ot_register
  ON attendance_register_employee_overtime(register_id);

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(8, 2) NOT NULL DEFAULT 0;

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC(18, 2) NOT NULL DEFAULT 0;
