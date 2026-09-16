-- Snapshot father's name on advance entries (same identity fields as salary register).
ALTER TABLE employee_advance_entries
  ADD COLUMN IF NOT EXISTS father_name VARCHAR(200);
