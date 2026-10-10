-- present_days is already NUMERIC(6,2). leave_days and absent_days stayed INT,
-- so a half day (absent = calendar days - present - leave) aborted payslip
-- generation with: invalid input syntax for type integer.

ALTER TABLE payroll_entries
  ALTER COLUMN leave_days TYPE NUMERIC(6, 2) USING leave_days::numeric,
  ALTER COLUMN absent_days TYPE NUMERIC(6, 2) USING absent_days::numeric;
