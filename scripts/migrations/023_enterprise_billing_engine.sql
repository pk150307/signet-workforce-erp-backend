-- Phase 1: Enterprise Billing & Invoice Management Engine
-- Extends existing clients, sites (client sites), attendance_registers, payroll_runs,
-- designation_grades, client_designation_grade_rates, invoices, invoice_line_items.
-- Does NOT duplicate attendance/payroll/grade-pay tables.

-- ---------------------------------------------------------------------------
-- Company profile: bank & statutory codes for GST invoice header
-- ---------------------------------------------------------------------------

ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS pf_establishment_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS esic_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_branch VARCHAR(200);

-- ---------------------------------------------------------------------------
-- Client contracts (replaces embedded contract fields on clients over time)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  contract_code VARCHAR(50) NOT NULL,
  contract_name VARCHAR(300) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  billing_type VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_type IN ('monthly', 'daily', 'hourly')),
  billing_rate NUMERIC(18, 2),
  pf_pct NUMERIC(5, 2),
  esic_pct NUMERIC(5, 2),
  service_charge_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  lwf_pct NUMERIC(5, 2),
  gst_pct NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
  penalty_rules JSONB,
  invoice_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (invoice_frequency IN ('monthly', 'biweekly', 'weekly')),
  invoice_prefix VARCHAR(20),
  invoice_terms TEXT,
  contract_document_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200),
  CONSTRAINT uq_contracts_client_code UNIQUE (client_id, contract_code)
);

CREATE INDEX IF NOT EXISTS idx_contracts_client
  ON contracts(client_id, status)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_contracts_site
  ON contracts(site_id)
  WHERE NOT is_deleted AND site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_active
  ON contracts(client_id, start_date, end_date)
  WHERE NOT is_deleted AND status = 'active';

-- Backfill one active contract per client from legacy client.contract_* columns
INSERT INTO contracts (
  client_id, contract_code, contract_name, start_date, end_date,
  contract_document_url, status, created_by
)
SELECT
  c.id,
  c.client_code || '-CON-001',
  c.company_name || ' - Master Contract',
  COALESCE(c.contract_start_date, CURRENT_DATE),
  c.contract_end_date,
  c.contract_document_url,
  CASE
    WHEN c.contract_end_date IS NOT NULL AND c.contract_end_date < CURRENT_DATE THEN 'expired'
    WHEN c.is_active THEN 'active'
    ELSE 'terminated'
  END,
  'System'
FROM clients c
WHERE NOT c.is_deleted
  AND NOT EXISTS (
    SELECT 1 FROM contracts ct
    WHERE ct.client_id = c.id AND NOT ct.is_deleted
  );

-- ---------------------------------------------------------------------------
-- Billing configuration (one active config per client site)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  billing_type VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_type IN ('monthly', 'daily', 'hourly')),
  required_headcount INT,
  billing_rate NUMERIC(18, 2),
  service_charge_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  pf_pct NUMERIC(5, 2),
  esic_pct NUMERIC(5, 2),
  lwf_pct NUMERIC(5, 2),
  gst_pct NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
  gst_type VARCHAR(10) NOT NULL DEFAULT 'cgst_sgst'
    CHECK (gst_type IN ('cgst_sgst', 'igst')),
  invoice_prefix VARCHAR(20),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'biweekly', 'weekly')),
  invoice_due_days INT NOT NULL DEFAULT 30,
  invoice_notes TEXT,
  sac_code VARCHAR(20) NOT NULL DEFAULT '998519',
  nature_of_service VARCHAR(500) DEFAULT 'Manpower Supply Services',
  contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200),
  CONSTRAINT uq_billing_config_site UNIQUE (site_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_config_client
  ON billing_configurations(client_id)
  WHERE NOT is_deleted;

-- Seed billing config from existing site billing fields
INSERT INTO billing_configurations (
  client_id, site_id, billing_type, required_headcount, billing_rate,
  invoice_due_days, sac_code, created_by
)
SELECT
  s.client_id,
  s.id,
  CASE
    WHEN s.billing_rate_per_day IS NOT NULL AND COALESCE(s.billing_rate_per_month, 0) = 0 THEN 'daily'
    ELSE 'monthly'
  END,
  s.required_headcount,
  COALESCE(s.billing_rate_per_month, s.billing_rate_per_day),
  COALESCE(c.payment_term_days, 30),
  '998519',
  'System'
FROM sites s
JOIN clients c ON c.id = s.client_id AND NOT c.is_deleted
WHERE NOT s.is_deleted
  AND NOT EXISTS (
    SELECT 1 FROM billing_configurations bc
    WHERE bc.site_id = s.id AND NOT bc.is_deleted
  );

-- ---------------------------------------------------------------------------
-- Billing components (configurable invoice line categories)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  component_type VARCHAR(30) NOT NULL
    CHECK (component_type IN (
      'basic_charge', 'statutory', 'service_charge', 'other_charge',
      'penalty', 'adjustment', 'discount'
    )),
  sort_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_enabled_by_default BOOLEAN NOT NULL DEFAULT TRUE,
  is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
  hsn_sac_code VARCHAR(20) DEFAULT '998519',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

INSERT INTO billing_components (code, name, component_type, sort_order, is_system, is_enabled_by_default, is_taxable)
VALUES
  ('BASIC_CHARGES', 'Basic Charges / Employee Charges', 'basic_charge', 10, TRUE, TRUE, TRUE),
  ('PF_CONTRIBUTION', 'PF Contribution (Employer Reimbursement)', 'statutory', 20, TRUE, TRUE, TRUE),
  ('ESIC_CONTRIBUTION', 'ESIC Contribution (Employer Reimbursement)', 'statutory', 30, TRUE, TRUE, TRUE),
  ('LWF', 'Labour Welfare Fund', 'statutory', 40, TRUE, TRUE, TRUE),
  ('SERVICE_CHARGES', 'Service Charges', 'service_charge', 50, TRUE, TRUE, TRUE),
  ('OTHER_CHARGES', 'Other Charges', 'other_charge', 60, TRUE, FALSE, TRUE),
  ('PENALTY', 'Penalty', 'penalty', 70, TRUE, FALSE, TRUE),
  ('ADJUSTMENT', 'Adjustment', 'adjustment', 80, TRUE, FALSE, TRUE),
  ('DISCOUNT', 'Discount', 'discount', 90, TRUE, FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing_configuration_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_configuration_id UUID NOT NULL REFERENCES billing_configurations(id) ON DELETE CASCADE,
  billing_component_id UUID NOT NULL REFERENCES billing_components(id),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  rate_override NUMERIC(18, 2),
  pct_override NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  CONSTRAINT uq_billing_config_component UNIQUE (billing_configuration_id, billing_component_id)
);

-- Enable default components for seeded billing configurations
INSERT INTO billing_configuration_components (
  billing_configuration_id, billing_component_id, is_enabled, sort_order, created_by
)
SELECT
  bc.id,
  comp.id,
  comp.is_enabled_by_default,
  comp.sort_order,
  'System'
FROM billing_configurations bc
CROSS JOIN billing_components comp
WHERE NOT bc.is_deleted
  AND NOT comp.is_deleted
  AND comp.is_enabled_by_default
  AND NOT EXISTS (
    SELECT 1 FROM billing_configuration_components bcc
    WHERE bcc.billing_configuration_id = bc.id
      AND bcc.billing_component_id = comp.id
  );

-- Optional site-specific grade billing rates (extends 011 client_designation_grade_rates)
ALTER TABLE client_designation_grade_rates
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

ALTER TABLE client_designation_grade_rates
  DROP CONSTRAINT IF EXISTS client_designation_grade_rates_client_id_designation_grade_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_grade_rates_scope
  ON client_designation_grade_rates (
    client_id,
    designation_grade_id,
    COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- ---------------------------------------------------------------------------
-- Invoice series (FY-aware numbering e.g. 44/26-27)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  series_code VARCHAR(50) NOT NULL,
  prefix VARCHAR(20),
  financial_year_start INT NOT NULL CHECK (financial_year_start BETWEEN 2000 AND 2100),
  financial_year_end INT NOT NULL CHECK (financial_year_end BETWEEN 2000 AND 2100),
  current_sequence INT NOT NULL DEFAULT 0,
  format_template VARCHAR(100) NOT NULL DEFAULT '{seq}/{fy_short}',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200),
  CONSTRAINT uq_invoice_series_code UNIQUE (series_code, financial_year_start, financial_year_end)
);

CREATE INDEX IF NOT EXISTS idx_invoice_series_client
  ON invoice_series(client_id, financial_year_start)
  WHERE NOT is_deleted;

-- Default company-wide series for current FY (Apr–Mar India FY; adjust in app if needed)
INSERT INTO invoice_series (
  series_code, prefix, financial_year_start, financial_year_end,
  current_sequence, format_template, is_default, is_active, created_by
)
SELECT
  'DEFAULT-' || fy_start || '-' || fy_end,
  NULL,
  fy_start,
  fy_end,
  0,
  '{seq}/{fy_short}',
  TRUE,
  TRUE,
  'System'
FROM (
  SELECT
    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
      THEN EXTRACT(YEAR FROM CURRENT_DATE)::int
      ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
    END AS fy_start,
    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
      THEN EXTRACT(YEAR FROM CURRENT_DATE)::int + 1
      ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int
    END AS fy_end
) fy
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_series s
  WHERE s.is_default AND s.financial_year_start = fy.fy_start AND NOT s.is_deleted
);

-- ---------------------------------------------------------------------------
-- Extend invoices (billing engine output + GST split + lifecycle)
-- ---------------------------------------------------------------------------

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_configuration_id UUID REFERENCES billing_configurations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attendance_register_id UUID REFERENCES attendance_registers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_series_id UUID REFERENCES invoice_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) NOT NULL DEFAULT 'standard'
    CHECK (invoice_type IN ('standard', 'credit_note', 'debit_note', 'revision')),
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS financial_year_start INT,
  ADD COLUMN IF NOT EXISTS financial_year_end INT,
  ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS company_state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nature_of_service VARCHAR(500),
  ADD COLUMN IF NOT EXISTS sac_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS employee_charges NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_contribution NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS esic_contribution NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lwf_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_charges NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS sent_to_email VARCHAR(200),
  ADD COLUMN IF NOT EXISTS calculation_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_invoices_contract
  ON invoices(contract_id)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_invoices_billing_config
  ON invoices(billing_configuration_id)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_invoices_parent
  ON invoices(parent_invoice_id)
  WHERE NOT is_deleted AND parent_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_status_period
  ON invoices(status, year, month)
  WHERE NOT is_deleted;

-- Backfill taxable_value from existing sub_total
UPDATE invoices
SET taxable_value = sub_total
WHERE taxable_value = 0 AND sub_total <> 0;

-- Map legacy gst_amount into CGST+SGST split when states unknown (same-state assumption)
UPDATE invoices
SET
  cgst_rate = gst_rate / 2,
  sgst_rate = gst_rate / 2,
  cgst_amount = ROUND(gst_amount / 2, 2),
  sgst_amount = gst_amount - ROUND(gst_amount / 2, 2)
WHERE gst_amount > 0
  AND cgst_amount = 0
  AND sgst_amount = 0
  AND igst_amount = 0;

-- ---------------------------------------------------------------------------
-- Extend invoice_line_items (invoice_items in spec)
-- ---------------------------------------------------------------------------

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS billing_component_id UUID REFERENCES billing_components(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS component_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS designation_grade_id UUID REFERENCES designation_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

UPDATE invoice_line_items
SET amount = ROUND(quantity * unit_rate, 2),
    taxable_amount = ROUND(quantity * unit_rate, 2)
WHERE amount IS NULL;

-- ---------------------------------------------------------------------------
-- Invoice tax breakdown (CGST / SGST / IGST rows)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_tax (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_type VARCHAR(10) NOT NULL CHECK (tax_type IN ('cgst', 'sgst', 'igst')),
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  CONSTRAINT uq_invoice_tax_type UNIQUE (invoice_id, tax_type)
);

CREATE INDEX IF NOT EXISTS idx_invoice_tax_invoice
  ON invoice_tax(invoice_id);

-- Backfill tax rows for existing invoices with GST
INSERT INTO invoice_tax (invoice_id, tax_type, tax_rate, taxable_amount, tax_amount, created_by)
SELECT i.id, 'cgst', i.cgst_rate, i.taxable_value, i.cgst_amount, 'System'
FROM invoices i
WHERE i.cgst_amount > 0
  AND NOT i.is_deleted
ON CONFLICT (invoice_id, tax_type) DO NOTHING;

INSERT INTO invoice_tax (invoice_id, tax_type, tax_rate, taxable_amount, tax_amount, created_by)
SELECT i.id, 'sgst', i.sgst_rate, i.taxable_value, i.sgst_amount, 'System'
FROM invoices i
WHERE i.sgst_amount > 0
  AND NOT i.is_deleted
ON CONFLICT (invoice_id, tax_type) DO NOTHING;

INSERT INTO invoice_tax (invoice_id, tax_type, tax_rate, taxable_amount, tax_amount, created_by)
SELECT i.id, 'igst', i.igst_rate, i.taxable_value, i.igst_amount, 'System'
FROM invoices i
WHERE i.igst_amount > 0
  AND NOT i.is_deleted
ON CONFLICT (invoice_id, tax_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Payment tracking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  reference_number VARCHAR(100),
  utr_number VARCHAR(100),
  payment_mode VARCHAR(20) NOT NULL DEFAULT 'neft'
    CHECK (payment_mode IN ('cheque', 'neft', 'rtgs', 'upi', 'cash', 'other')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice
  ON invoice_payments(invoice_id, payment_date DESC)
  WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- Invoice version history (revisions, credit/debit notes)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  change_type VARCHAR(30) NOT NULL
    CHECK (change_type IN (
      'created', 'generated', 'revised', 'approved', 'sent',
      'cancelled', 'payment_recorded', 'credit_note', 'debit_note'
    )),
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System'
);

CREATE INDEX IF NOT EXISTS idx_invoice_history_invoice
  ON invoice_history(invoice_id, version_number DESC);

-- ---------------------------------------------------------------------------
-- Invoice documents (PDF, attachments)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL DEFAULT 'pdf'
    CHECK (document_type IN ('pdf', 'print', 'email_copy', 'signed', 'other')),
  file_name VARCHAR(500) NOT NULL,
  file_path TEXT NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_invoice_documents_invoice
  ON invoice_documents(invoice_id)
  WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- Invoice notes (internal)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System',
  updated_at TIMESTAMPTZ,
  updated_by VARCHAR(200),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice
  ON invoice_notes(invoice_id, created_at DESC)
  WHERE NOT is_deleted;

-- ---------------------------------------------------------------------------
-- Invoice-specific audit trail (field-level changes)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoice_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(128),
  user_agent TEXT,
  browser VARCHAR(100),
  operating_system VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200) NOT NULL DEFAULT 'System'
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_logs_invoice
  ON invoice_audit_logs(invoice_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Invoice status reference (extends app InvoiceStatus enum)
-- Existing: 1=Draft, 2=Sent, 3=Viewed, 4=PartiallyPaid, 5=Paid, 6=Overdue, 7=Cancelled
-- New:      8=Generated, 9=Approved, 10=Archived
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN invoices.status IS
  '1=Draft, 2=Sent, 3=Viewed, 4=PartiallyPaid, 5=Paid, 6=Overdue, 7=Cancelled, 8=Generated, 9=Approved, 10=Archived';
