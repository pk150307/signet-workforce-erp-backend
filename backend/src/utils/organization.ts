import { query } from '../database/pool';
import { NotFoundError } from '../common/errors';

export async function resolveDepartmentId(departmentId: string): Promise<string> {
  const byUuid = await query<{ id: string }>(
    `SELECT id FROM departments WHERE id = $1::uuid AND NOT is_deleted`,
    [departmentId],
  );
  if (byUuid.rows[0]) return byUuid.rows[0].id;

  const byCode = await query<{ id: string }>(
    `SELECT id FROM departments WHERE code = $1 AND NOT is_deleted`,
    [departmentId],
  );
  if (byCode.rows[0]) return byCode.rows[0].id;

  throw new NotFoundError('Department', departmentId);
}

export async function resolveDesignationId(designationId: string): Promise<string> {
  const byUuid = await query<{ id: string }>(
    `SELECT id FROM designations WHERE id = $1::uuid AND NOT is_deleted`,
    [designationId],
  );
  if (byUuid.rows[0]) return byUuid.rows[0].id;

  const byCode = await query<{ id: string }>(
    `SELECT id FROM designations WHERE code = $1 AND NOT is_deleted`,
    [designationId],
  );
  if (byCode.rows[0]) return byCode.rows[0].id;

  throw new NotFoundError('Designation', designationId);
}

export function parseOptionalUuid(value: string | undefined | null): string | null {
  if (!value) return null;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value) ? value : null;
}
