-- Normalized employee management schema

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS draft_step INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctc NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS left_reason TEXT,
  ADD COLUMN IF NOT EXISTS left_remarks TEXT;

-- Align legacy status values with lifecycle: Draft=0, Active=1, Left=2, Rejoined=3
UPDATE employees SET status = 1 WHERE status IN (1, 3, 5, 6) AND NOT is_deleted;
UPDATE employees SET status = 2 WHERE status IN (2, 4) AND NOT is_deleted;

CREATE TABLE IF NOT EXISTS employee_personal_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  alternate_phone VARCHAR(20),
  date_of_birth DATE NOT NULL,
  gender INT NOT NULL,
  present_address TEXT,
  permanent_address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pin_code VARCHAR(20),
  profile_photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS employee_employment_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employment_type INT NOT NULL DEFAULT 1,
  department_id UUID NOT NULL REFERENCES departments(id),
  designation_id UUID NOT NULL REFERENCES designations(id),
  reporting_manager_id UUID REFERENCES employees(id),
  site_id UUID REFERENCES sites(id),
  shift_id UUID REFERENCES shifts(id),
  joining_date DATE NOT NULL,
  confirmation_date DATE,
  resignation_date DATE,
  relieving_date DATE,
  basic_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  gross_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ctc NUMERIC(18, 2),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  period_sequence INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_current_employment
  ON employee_employment_details (employee_id)
  WHERE is_current = TRUE;

CREATE TABLE IF NOT EXISTS employee_bank_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  bank_name VARCHAR(200),
  account_number VARCHAR(50),
  ifsc_code VARCHAR(20),
  account_holder_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contact_name VARCHAR(200) NOT NULL,
  relationship VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,
  label VARCHAR(200) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_path TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  replaced_document_id UUID REFERENCES employee_documents(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by VARCHAR(200) NOT NULL DEFAULT 'System',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee
  ON employee_documents (employee_id, document_type)
  WHERE NOT is_deleted AND is_current = TRUE;

CREATE TABLE IF NOT EXISTS employee_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by VARCHAR(200) NOT NULL DEFAULT 'System',
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_history_employee
  ON employee_history (employee_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS employee_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_status INT,
  to_status INT NOT NULL,
  reason TEXT,
  remarks TEXT,
  last_working_date DATE,
  effective_date DATE,
  changed_by VARCHAR(200) NOT NULL DEFAULT 'System',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill normalized tables from existing employees
INSERT INTO employee_personal_details (
  employee_id, first_name, last_name, alternate_phone, date_of_birth, gender,
  present_address, permanent_address, city, state, pin_code, profile_photo_url, created_by
)
SELECT
  e.id, e.first_name, e.last_name, e.alternate_phone, e.date_of_birth, e.gender,
  e.present_address, e.permanent_address, e.city, e.state, e.pin_code, e.profile_photo_url, e.created_by
FROM employees e
WHERE NOT e.is_deleted
ON CONFLICT (employee_id) DO NOTHING;

INSERT INTO employee_employment_details (
  employee_id, employment_type, department_id, designation_id, reporting_manager_id, site_id,
  shift_id, joining_date, confirmation_date, resignation_date, relieving_date,
  basic_salary, gross_salary, ctc, is_current, period_sequence, created_by
)
SELECT
  e.id, e.employment_type, e.department_id, e.designation_id, e.reporting_manager_id, e.site_id,
  e.shift_id, e.joining_date, e.confirmation_date, e.resignation_date, e.relieving_date,
  e.basic_salary, e.gross_salary, e.ctc, TRUE, 1, e.created_by
FROM employees e
WHERE NOT e.is_deleted
AND NOT EXISTS (SELECT 1 FROM employee_employment_details ed WHERE ed.employee_id = e.id);

INSERT INTO employee_bank_details (
  employee_id, bank_name, account_number, ifsc_code, account_holder_name, created_by
)
SELECT e.id, e.bank_name, e.account_number, e.ifsc_code, e.account_holder_name, e.created_by
FROM employees e
WHERE NOT e.is_deleted
ON CONFLICT (employee_id) DO NOTHING;
