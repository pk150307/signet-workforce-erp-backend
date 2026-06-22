-- Billing enhancements: fractional line quantities + status audit trail

ALTER TABLE invoice_line_items
  ALTER COLUMN quantity TYPE NUMERIC(10, 2) USING quantity::NUMERIC(10, 2);

CREATE TABLE IF NOT EXISTS invoice_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  from_status INT,
  to_status INT NOT NULL,
  note TEXT,
  performed_by VARCHAR(200) NOT NULL DEFAULT 'System',
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_status_events_invoice
  ON invoice_status_events(invoice_id, performed_at DESC);
