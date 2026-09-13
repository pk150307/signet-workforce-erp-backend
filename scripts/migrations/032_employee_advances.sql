-- Employee Advances: capture advances given mid-cycle; deduct from salary net at payment time.
-- Does NOT modify salary_registers — only reads net_pay as a snapshot when available.

CREATE TABLE IF NOT EXISTS employee_advance_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'finalized', 'reopened')),
  run_number INT NOT NULL DEFAULT 1,
  -- Optional read-only link to salary register for the same period (no FK write-back).
  salary_register_id UUID REFERENCES salary_registers(id) ON DELETE SET NULL,
  total_employees INT NOT NULL DEFAULT 0,
  total_advance NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_salary_net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(18,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by VARCHAR(200) NOT NULL DEFAULT 'System',
  finalized_at TIMESTAMPTZ,
  finalized_by VARCHAR(200),
  reopened_at TIMESTAMPTZ,
  reopened_by VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  UNIQUE (client_id, month, year, run_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_advance_registers_finalized_period
  ON employee_advance_registers (client_id, month, year)
  WHERE status = 'finalized';

CREATE INDEX IF NOT EXISTS idx_employee_advance_registers_client
  ON employee_advance_registers(client_id);
CREATE INDEX IF NOT EXISTS idx_employee_advance_registers_period
  ON employee_advance_registers(year, month);
CREATE INDEX IF NOT EXISTS idx_employee_advance_registers_status
  ON employee_advance_registers(status);

CREATE TABLE IF NOT EXISTS employee_advance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_register_id UUID NOT NULL REFERENCES employee_advance_registers(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  soft_code VARCHAR(100),
  employee_code VARCHAR(50) NOT NULL,
  employee_name VARCHAR(200) NOT NULL,
  designation VARCHAR(200),
  -- Amount given to the employee as advance (editable until finalized).
  advance_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
  notes VARCHAR(500),
  -- Snapshot of salary-register net pay for payment calculation (nullable if no salary sheet yet).
  salary_net_pay NUMERIC(18,2),
  -- salary_net_pay - advance_amount (null when salary_net_pay is null).
  payable_amount NUMERIC(18,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE (advance_register_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_advance_entries_register
  ON employee_advance_entries(advance_register_id);
CREATE INDEX IF NOT EXISTS idx_employee_advance_entries_employee
  ON employee_advance_entries(employee_id);

CREATE TABLE IF NOT EXISTS employee_advance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES employee_advance_entries(id) ON DELETE CASCADE,
  paid_on DATE NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_employee_advance_payments_entry
  ON employee_advance_payments(entry_id);
CREATE INDEX IF NOT EXISTS idx_employee_advance_payments_paid_on
  ON employee_advance_payments(paid_on);

CREATE TABLE IF NOT EXISTS employee_advance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_register_id UUID NOT NULL REFERENCES employee_advance_registers(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES employee_advance_entries(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  reason TEXT,
  old_values JSONB,
  new_values JSONB,
  performed_by VARCHAR(200) NOT NULL DEFAULT 'System',
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_advance_audit_register
  ON employee_advance_audit(advance_register_id);
