-- Client soft code on employee (Employment Details)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS client_soft_code VARCHAR(50);

ALTER TABLE employee_employment_details
  ADD COLUMN IF NOT EXISTS client_soft_code VARCHAR(50);
