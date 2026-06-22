-- Department -> Designation -> Grade hierarchy with compensation & client billing rates

CREATE TABLE IF NOT EXISTS designation_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designation_id UUID NOT NULL REFERENCES designations(id),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  level INT NOT NULL DEFAULT 1,
  basic_salary NUMERIC(18, 2) NOT NULL DEFAULT 0,
  house_rent_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  night_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  punctuality_award NUMERIC(18, 2) NOT NULL DEFAULT 0,
  special_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  overtime_rate_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200),
  UNIQUE (designation_id, code)
);

CREATE INDEX IF NOT EXISTS idx_designation_grades_designation
  ON designation_grades(designation_id) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS client_designation_grade_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  designation_grade_id UUID NOT NULL REFERENCES designation_grades(id),
  rate_per_day NUMERIC(18, 2),
  rate_per_month NUMERIC(18, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  UNIQUE (client_id, designation_grade_id)
);

CREATE INDEX IF NOT EXISTS idx_client_grade_rates_client
  ON client_designation_grade_rates(client_id);
CREATE INDEX IF NOT EXISTS idx_client_grade_rates_grade
  ON client_designation_grade_rates(designation_grade_id);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS designation_grade_id UUID REFERENCES designation_grades(id);

ALTER TABLE employee_employment_details
  ADD COLUMN IF NOT EXISTS designation_grade_id UUID REFERENCES designation_grades(id);

-- Seed one default grade per existing designation from legacy level column
INSERT INTO designation_grades (
  designation_id, code, name, level, basic_salary, house_rent_allowance,
  special_allowance, is_active, created_by
)
SELECT des.id,
       'G' || des.level::text,
       des.name || ' - Grade ' || des.level::text,
       des.level,
       0, 0, 0,
       des.is_active,
       'System'
FROM designations des
WHERE NOT des.is_deleted
ON CONFLICT (designation_id, code) DO NOTHING;
