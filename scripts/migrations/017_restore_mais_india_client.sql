-- Restore Mais India client identity after demo seed accidentally reused CLT-0001.
-- All employees, sites, payslips, attendance, and billing rates remain on this client id.

UPDATE clients
SET company_name = 'Mais India',
    updated_at = NOW(),
    updated_by = 'System'
WHERE id = '89492b51-66a6-4f61-99e6-15fbd513da68'
  AND client_code = 'CLT-0001';

-- Remove demo sites that were seeded onto the production Mais India client.
UPDATE sites
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'System',
    updated_at = NOW()
WHERE client_id = '89492b51-66a6-4f61-99e6-15fbd513da68'
  AND site_code IN ('SITE-BTP', 'SITE-WFM')
  AND NOT is_deleted;
