-- Client-specific monthly salary register (Excel Salary_Register equivalent)

CREATE TABLE IF NOT EXISTS salary_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INT NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'calculated', 'reviewed', 'finalized', 'reopened')),
  run_number INT NOT NULL DEFAULT 1,
  attendance_register_id UUID REFERENCES attendance_registers(id),
  month_days INT NOT NULL,
  config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_employees INT NOT NULL DEFAULT 0,
  total_gross_earnings NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_att_aw_afd NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_gross NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_esic NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_epf NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_lwf NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_registers_finalized_period
  ON salary_registers (client_id, month, year)
  WHERE status = 'finalized';

CREATE INDEX IF NOT EXISTS idx_salary_registers_client ON salary_registers(client_id);
CREATE INDEX IF NOT EXISTS idx_salary_registers_period ON salary_registers(year, month);
CREATE INDEX IF NOT EXISTS idx_salary_registers_status ON salary_registers(status);

CREATE TABLE IF NOT EXISTS salary_register_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_register_id UUID NOT NULL REFERENCES salary_registers(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  source_attendance_extras_id UUID,
  soft_code VARCHAR(100),
  employee_code VARCHAR(50) NOT NULL,
  employee_name VARCHAR(200) NOT NULL,
  father_name VARCHAR(200),
  designation VARCHAR(200),
  aadhaar_number VARCHAR(20),
  account_number VARCHAR(50),
  uan_number VARCHAR(50),
  esi_number VARCHAR(50),
  month_days INT NOT NULL,
  pay_days NUMERIC(6,2) NOT NULL DEFAULT 0,
  ot_hours NUMERIC(8,2),
  basic_salary NUMERIC(18,2) NOT NULL DEFAULT 0,
  hra NUMERIC(18,2) NOT NULL DEFAULT 0,
  fixed_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  earning_basic NUMERIC(18,2) NOT NULL DEFAULT 0,
  earning_hra NUMERIC(18,2) NOT NULL DEFAULT 0,
  ot_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  n_all NUMERIC(18,2) NOT NULL DEFAULT 0,
  gross_earnings NUMERIC(18,2) NOT NULL DEFAULT 0,
  att_aw_afd NUMERIC(18,2) NOT NULL DEFAULT 0,
  gross_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  esic NUMERIC(18,2) NOT NULL DEFAULT 0,
  epf NUMERIC(18,2) NOT NULL DEFAULT 0,
  lwf NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_deduction NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(18,2) NOT NULL DEFAULT 0,
  ot_basis VARCHAR(50),
  pf_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  esi_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  lwf_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  validation_status VARCHAR(20) NOT NULL DEFAULT 'ok'
    CHECK (validation_status IN ('ok', 'warning', 'error')),
  validation_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  calculation_version INT NOT NULL DEFAULT 1,
  row_status VARCHAR(20) NOT NULL DEFAULT 'calculated'
    CHECK (row_status IN ('calculated', 'adjusted', 'excluded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE (salary_register_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_salary_register_employees_register
  ON salary_register_employees(salary_register_id);
CREATE INDEX IF NOT EXISTS idx_salary_register_employees_employee
  ON salary_register_employees(employee_id);

CREATE TABLE IF NOT EXISTS salary_register_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salary_register_id UUID NOT NULL REFERENCES salary_registers(id) ON DELETE CASCADE,
  employee_row_id UUID REFERENCES salary_register_employees(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  reason TEXT,
  old_values JSONB,
  new_values JSONB,
  performed_by VARCHAR(200) NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_register_audit_register
  ON salary_register_audit(salary_register_id);
