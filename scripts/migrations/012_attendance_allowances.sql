-- Move night allowance and punctuality award from designation grades to attendance register

ALTER TABLE attendance_register_employee_overtime
  ADD COLUMN IF NOT EXISTS night_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (night_allowance >= 0),
  ADD COLUMN IF NOT EXISTS punctuality_award NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (punctuality_award >= 0);

ALTER TABLE payroll_entries
  ADD COLUMN IF NOT EXISTS night_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS punctuality_award NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE designation_grades
  DROP COLUMN IF EXISTS night_allowance,
  DROP COLUMN IF EXISTS punctuality_award;
