-- Move compensation / statutory applicability onto the employee (Employee Master).
-- Designation pay grades remain for legacy billing rates but are no longer the source of employee salary.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS house_rent_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE employee_employment_details
  ADD COLUMN IF NOT EXISTS house_rent_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE employee_statutory_details
  ADD COLUMN IF NOT EXISTS is_lwf_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS employee_lwf_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS employee_lwf_max_amount NUMERIC(18, 2) NOT NULL DEFAULT 35;

-- Backfill HRA/special from assigned designation grade when employee values are still zero
UPDATE employee_employment_details ed
SET
  house_rent_allowance = COALESCE(dg.house_rent_allowance, 0),
  special_allowance = COALESCE(dg.special_allowance, 0)
FROM designation_grades dg
WHERE ed.designation_grade_id = dg.id
  AND NOT dg.is_deleted
  AND ed.house_rent_allowance = 0
  AND ed.special_allowance = 0
  AND (COALESCE(dg.house_rent_allowance, 0) > 0 OR COALESCE(dg.special_allowance, 0) > 0);

UPDATE employees e
SET
  house_rent_allowance = COALESCE(ed.house_rent_allowance, e.house_rent_allowance),
  special_allowance = COALESCE(ed.special_allowance, e.special_allowance)
FROM employee_employment_details ed
WHERE ed.employee_id = e.id
  AND ed.is_current = TRUE
  AND (e.house_rent_allowance = 0 OR e.special_allowance = 0);

-- Sync LWF applicability from grade when employee still has the default and a grade exists
UPDATE employee_statutory_details esd
SET is_lwf_applicable = COALESCE(dg.is_lwf_applicable, esd.is_lwf_applicable)
FROM employees e
LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
LEFT JOIN designation_grades dg ON dg.id = COALESCE(ed.designation_grade_id, e.designation_grade_id) AND NOT dg.is_deleted
WHERE esd.employee_id = e.id
  AND dg.id IS NOT NULL;
