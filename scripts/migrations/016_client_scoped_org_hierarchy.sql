-- Scope departments under clients: Client -> Department -> Designation -> Pay Grade

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- Assign each department to the client with the most employees in that department
UPDATE departments d
SET client_id = sub.client_id
FROM (
  SELECT DISTINCT ON (e.department_id)
    e.department_id,
    s.client_id,
    COUNT(*) AS cnt
  FROM employees e
  INNER JOIN sites s ON s.id = e.site_id AND NOT s.is_deleted
  WHERE NOT e.is_deleted AND e.department_id IS NOT NULL
  GROUP BY e.department_id, s.client_id
  ORDER BY e.department_id, COUNT(*) DESC, s.client_id
) sub
WHERE d.id = sub.department_id AND d.client_id IS NULL;

-- Fallback: first active client
UPDATE departments
SET client_id = (
  SELECT id FROM clients WHERE NOT is_deleted ORDER BY created_at LIMIT 1
)
WHERE client_id IS NULL;

ALTER TABLE departments
  ALTER COLUMN client_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_client
  ON departments(client_id) WHERE NOT is_deleted;

ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS departments_client_code_unique
  ON departments (client_id, code) WHERE NOT is_deleted;

ALTER TABLE designations DROP CONSTRAINT IF EXISTS designations_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS designations_department_code_unique
  ON designations (department_id, code) WHERE NOT is_deleted;
