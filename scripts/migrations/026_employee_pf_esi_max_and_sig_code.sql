-- PF / ESIC max contribution amounts on employee statutory details
-- and migrate employee codes to SIG-000001 format.

ALTER TABLE employee_statutory_details
  ADD COLUMN IF NOT EXISTS employee_pf_max_amount NUMERIC(18, 2) NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS employee_esi_max_amount NUMERIC(18, 2) NOT NULL DEFAULT 0;

-- Renumber existing employees to sequential SIG-000001 format (by join order)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM employees
  WHERE NOT is_deleted
)
UPDATE employees e
SET employee_code = 'SIG-' || LPAD(n.rn::text, 6, '0'),
    updated_at = NOW(),
    updated_by = 'System'
FROM numbered n
WHERE e.id = n.id;
