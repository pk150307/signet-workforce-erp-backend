-- PF/ESIC statutory details and salary slips

CREATE TABLE IF NOT EXISTS employee_statutory_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  uan_number VARCHAR(50),
  pf_number VARCHAR(50),
  pf_joining_date DATE,
  pf_exit_date DATE,
  pf_nominee_name VARCHAR(200),
  pf_nominee_relation VARCHAR(100),
  pf_account_number VARCHAR(50),
  employer_pf_percentage NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
  employee_pf_percentage NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
  is_pf_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  pf_remarks TEXT,
  esi_number VARCHAR(50),
  esi_dispensary VARCHAR(200),
  esi_joining_date DATE,
  esi_exit_date DATE,
  is_esi_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  employer_esi_percentage NUMERIC(5, 2) NOT NULL DEFAULT 3.25,
  employee_esi_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.75,
  family_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  esi_remarks TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS salary_slips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_number VARCHAR(50) NOT NULL UNIQUE,
  payroll_entry_id UUID NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  month INT NOT NULL,
  year INT NOT NULL,
  gross_earnings NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(18, 2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  earnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  deductions JSONB NOT NULL DEFAULT '[]'::jsonb,
  attendance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_path TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(50) NOT NULL DEFAULT 'generated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200),
  CONSTRAINT uq_salary_slip_employee_period UNIQUE (employee_id, month, year)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_site_period
  ON invoices (site_id, month, year)
  WHERE site_id IS NOT NULL AND NOT is_deleted;

-- Backfill statutory rows from existing employee PF/ESI fields
INSERT INTO employee_statutory_details (
  employee_id, uan_number, pf_number, esi_number, created_by
)
SELECT e.id, e.uan_number, e.pf_number, e.esi_number, 'System'
FROM employees e
WHERE NOT e.is_deleted
ON CONFLICT (employee_id) DO NOTHING;
