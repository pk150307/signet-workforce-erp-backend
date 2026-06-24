-- Revoke mistaken DeleteRequests.Approve grant from HR Manager (Super Admin only).

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.name = 'HR Manager'
  AND NOT r.is_deleted
  AND p.module = 'DeleteRequests'
  AND p.action = 'Approve'
  AND NOT p.is_deleted;
