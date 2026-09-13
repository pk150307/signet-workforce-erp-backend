-- Allow employees without an email address (multiple NULLs are allowed under UNIQUE).

ALTER TABLE employees
  ALTER COLUMN email DROP NOT NULL;

-- Normalize blank emails to NULL so unique constraint stays clean
UPDATE employees
SET email = NULL
WHERE email IS NOT NULL AND BTRIM(email) = '';
