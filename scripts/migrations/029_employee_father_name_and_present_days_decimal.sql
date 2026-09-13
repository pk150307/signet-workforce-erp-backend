-- Father's name on employee personal details; allow fractional present days in payroll.

ALTER TABLE employee_personal_details
  ADD COLUMN IF NOT EXISTS father_name VARCHAR(100);

ALTER TABLE payroll_entries
  ALTER COLUMN present_days TYPE NUMERIC(6, 2)
  USING present_days::numeric;
