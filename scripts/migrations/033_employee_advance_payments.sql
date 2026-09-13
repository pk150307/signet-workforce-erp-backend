-- Backfill dated payments for installs that already ran 032 without payments table.

CREATE TABLE IF NOT EXISTS employee_advance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES employee_advance_entries(id) ON DELETE CASCADE,
  paid_on DATE NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_employee_advance_payments_entry
  ON employee_advance_payments(entry_id);

CREATE INDEX IF NOT EXISTS idx_employee_advance_payments_paid_on
  ON employee_advance_payments(paid_on);

INSERT INTO employee_advance_payments (entry_id, paid_on, amount, notes, created_by)
SELECT
  e.id,
  COALESCE(e.updated_at::date, e.created_at::date, CURRENT_DATE),
  e.advance_amount,
  e.notes,
  'migration'
FROM employee_advance_entries e
WHERE e.advance_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM employee_advance_payments p WHERE p.entry_id = e.id
  );
