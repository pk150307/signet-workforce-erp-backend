-- Soft-delete empty duplicate demo clients created before seed was fixed (CLT-0002, CLT-0003).

UPDATE sites
SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'System', updated_at = NOW()
WHERE client_id IN (
  SELECT id FROM clients
  WHERE client_code IN ('CLT-0002', 'CLT-0003') AND NOT is_deleted
) AND NOT is_deleted;

UPDATE clients
SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'System', updated_at = NOW()
WHERE client_code IN ('CLT-0002', 'CLT-0003') AND NOT is_deleted;
