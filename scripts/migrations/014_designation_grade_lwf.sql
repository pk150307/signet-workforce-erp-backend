-- Labour Welfare Fund (LWF) on pay grades and payroll entries
ALTER TABLE designation_grades
  ADD COLUMN IF NOT EXISTS is_lwf_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS employee_lwf_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS employee_lwf_max_amount NUMERIC(18,2) NOT NULL DEFAULT 35.00;

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS lwf NUMERIC(18,2) NOT NULL DEFAULT 0;
