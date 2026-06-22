-- Client-specific billing rates per department (all optional)

CREATE TABLE IF NOT EXISTS client_department_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  rate_per_day NUMERIC(18, 2),
  rate_per_month NUMERIC(18, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  UNIQUE (client_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_client_dept_rates_client ON client_department_rates(client_id);
CREATE INDEX IF NOT EXISTS idx_client_dept_rates_department ON client_department_rates(department_id);
