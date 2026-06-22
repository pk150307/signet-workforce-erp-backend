-- Renumber existing employees to sequential SS-00001 format (by join order)

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM employees
  WHERE NOT is_deleted
)
UPDATE employees e
SET employee_code = 'SS-' || LPAD(n.rn::text, 5, '0'),
    updated_at = NOW(),
    updated_by = 'System'
FROM numbered n
WHERE e.id = n.id;
