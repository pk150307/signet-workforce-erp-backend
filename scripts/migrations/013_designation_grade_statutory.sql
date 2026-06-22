-- Pay grade statutory configuration (PF / ESIC applicability and employee contribution %)
ALTER TABLE designation_grades
  ADD COLUMN IF NOT EXISTS is_pf_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_esi_applicable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS employee_pf_percentage NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  ADD COLUMN IF NOT EXISTS employee_esi_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS employer_pf_percentage NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  ADD COLUMN IF NOT EXISTS employer_esi_percentage NUMERIC(5,2) NOT NULL DEFAULT 3.25;
