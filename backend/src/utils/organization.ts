import { query } from '../database/pool';
import { NotFoundError, ValidationError } from '../common/errors';

export interface OrgResolveOptions {
  clientId?: string;
  departmentId?: string;
  designationId?: string;
}

export async function resolveClientId(clientId: string): Promise<string> {
  const uuid = parseOptionalUuid(clientId);
  if (uuid) {
    const byUuid = await query<{ id: string }>(
      `SELECT id FROM clients WHERE id = $1::uuid AND NOT is_deleted`,
      [uuid],
    );
    if (byUuid.rows[0]) return byUuid.rows[0].id;
  }

  const byCode = await query<{ id: string }>(
    `SELECT id FROM clients WHERE code = $1 AND NOT is_deleted`,
    [clientId],
  );
  if (byCode.rows[0]) return byCode.rows[0].id;

  throw new NotFoundError('Client', clientId);
}

export async function resolveDepartmentId(
  departmentId: string,
  options?: OrgResolveOptions,
): Promise<string> {
  const uuid = parseOptionalUuid(departmentId);
  if (uuid) {
    const params: unknown[] = [uuid];
    let extra = '';
    if (options?.clientId) {
      extra = ' AND client_id = $2::uuid';
      params.push(await resolveClientId(options.clientId));
    }
    const byUuid = await query<{ id: string }>(
      `SELECT id FROM departments WHERE id = $1::uuid AND NOT is_deleted${extra}`,
      params,
    );
    if (byUuid.rows[0]) return byUuid.rows[0].id;
  }

  assertClientScopeForCodeLookup(departmentId, options?.clientId, 'departmentId');

  const params: unknown[] = [departmentId];
  let extra = '';
  if (options?.clientId) {
    extra = ' AND client_id = $2::uuid';
    params.push(await resolveClientId(options.clientId));
  }
  const byCode = await query<{ id: string }>(
    `SELECT id FROM departments WHERE code = $1 AND NOT is_deleted${extra} ORDER BY created_at LIMIT 1`,
    params,
  );
  if (byCode.rows[0]) return byCode.rows[0].id;

  throw new NotFoundError('Department', departmentId);
}

export async function resolveDesignationId(
  designationId: string,
  options?: OrgResolveOptions,
): Promise<string> {
  const uuid = parseOptionalUuid(designationId);
  if (uuid) {
    const params: unknown[] = [uuid];
    let extra = '';
    if (options?.departmentId) {
      extra = ' AND department_id = $2::uuid';
      params.push(await resolveDepartmentId(options.departmentId, options));
    } else if (options?.clientId) {
      extra = ` AND department_id IN (
        SELECT id FROM departments WHERE client_id = $2::uuid AND NOT is_deleted
      )`;
      params.push(await resolveClientId(options.clientId));
    }
    const byUuid = await query<{ id: string }>(
      `SELECT id FROM designations WHERE id = $1::uuid AND NOT is_deleted${extra}`,
      params,
    );
    if (byUuid.rows[0]) return byUuid.rows[0].id;
  }

  if (!options?.departmentId && !options?.clientId?.trim()) {
    assertClientScopeForCodeLookup(designationId, options?.clientId, 'designationId');
  }

  const params: unknown[] = [designationId];
  let extra = '';
  if (options?.departmentId) {
    extra = ' AND department_id = $2::uuid';
    params.push(await resolveDepartmentId(options.departmentId, options));
  } else if (options?.clientId) {
    extra = ` AND department_id IN (
      SELECT id FROM departments WHERE client_id = $2::uuid AND NOT is_deleted
    )`;
    params.push(await resolveClientId(options.clientId));
  }
  const byCode = await query<{ id: string }>(
    `SELECT id FROM designations WHERE code = $1 AND NOT is_deleted${extra} ORDER BY created_at LIMIT 1`,
    params,
  );
  if (byCode.rows[0]) return byCode.rows[0].id;

  throw new NotFoundError('Designation', designationId);
}

export async function resolveDesignationGradeId(
  gradeId: string,
  options?: OrgResolveOptions,
): Promise<string> {
  const uuid = parseOptionalUuid(gradeId);
  if (uuid) {
    const params: unknown[] = [uuid];
    let extra = '';
    if (options?.clientId) {
      extra = ` AND dg.designation_id IN (
        SELECT des.id FROM designations des
        INNER JOIN departments d ON d.id = des.department_id AND NOT d.is_deleted
        WHERE d.client_id = $2::uuid AND NOT des.is_deleted
      )`;
      params.push(await resolveClientId(options.clientId));
    }
    const byUuid = await query<{ id: string }>(
      `SELECT dg.id FROM designation_grades dg
       WHERE dg.id = $1::uuid AND NOT dg.is_deleted${extra}`,
      params,
    );
    if (byUuid.rows[0]) return byUuid.rows[0].id;
  }

  if (!options?.designationId && !options?.clientId?.trim()) {
    assertClientScopeForCodeLookup(gradeId, options?.clientId, 'designationGradeId');
  }

  const params: unknown[] = [gradeId];
  let joinExtra = '';
  if (options?.designationId) {
    joinExtra = ' AND dg.designation_id = $2::uuid';
    params.push(await resolveDesignationId(options.designationId, options));
  } else if (options?.clientId) {
    joinExtra = ` AND dg.designation_id IN (
      SELECT des.id FROM designations des
      INNER JOIN departments d ON d.id = des.department_id AND NOT d.is_deleted
      WHERE d.client_id = $2::uuid AND NOT des.is_deleted
    )`;
    params.push(await resolveClientId(options.clientId));
  }
  const byCode = await query<{ id: string }>(
    `SELECT dg.id FROM designation_grades dg
     WHERE dg.code = $1 AND NOT dg.is_deleted${joinExtra}
     ORDER BY dg.created_at LIMIT 1`,
    params,
  );
  if (byCode.rows[0]) return byCode.rows[0].id;

  throw new NotFoundError('Designation grade', gradeId);
}

export async function getDepartmentClientId(departmentId: string): Promise<string | null> {
  const resolvedId = await resolveDepartmentId(departmentId);
  const { rows } = await query<{ client_id: string }>(
    `SELECT client_id FROM departments WHERE id = $1::uuid AND NOT is_deleted`,
    [resolvedId],
  );
  return rows[0]?.client_id ?? null;
}

export async function assertDepartmentBelongsToClient(
  departmentId: string,
  clientId: string,
): Promise<void> {
  const resolvedDeptId = await resolveDepartmentId(departmentId);
  const resolvedClientId = await resolveClientId(clientId);
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM departments
     WHERE id = $1::uuid AND client_id = $2::uuid AND NOT is_deleted`,
    [resolvedDeptId, resolvedClientId],
  );
  if (!rows[0]) {
    throw new ValidationError(
      { departmentId: ['Department does not belong to the selected client.'] },
      'Department must belong to the employee client.',
    );
  }
}

export async function assertOrgHierarchyForClient(input: {
  clientId: string;
  departmentId: string;
  designationId: string;
  designationGradeId?: string | null;
}): Promise<void> {
  await assertDepartmentBelongsToClient(input.departmentId, input.clientId);

  const resolvedDeptId = await resolveDepartmentId(input.departmentId, { clientId: input.clientId });
  const resolvedDesId = await resolveDesignationId(input.designationId, {
    clientId: input.clientId,
    departmentId: resolvedDeptId,
  });

  const { rows: desRows } = await query<{ department_id: string }>(
    `SELECT department_id FROM designations WHERE id = $1::uuid AND NOT is_deleted`,
    [resolvedDesId],
  );
  if (desRows[0]?.department_id !== resolvedDeptId) {
    throw new ValidationError(
      { designationId: ['Designation does not belong to the selected department.'] },
      'Invalid designation for department.',
    );
  }

  if (input.designationGradeId?.trim()) {
    const gradeId = await resolveDesignationGradeId(input.designationGradeId.trim(), {
      clientId: input.clientId,
      designationId: resolvedDesId,
    });
    const { rows: gradeRows } = await query<{ designation_id: string }>(
      `SELECT designation_id FROM designation_grades WHERE id = $1::uuid AND NOT is_deleted`,
      [gradeId],
    );
    if (gradeRows[0]?.designation_id !== resolvedDesId) {
      throw new ValidationError(
        { designationGradeId: ['Pay grade does not belong to the selected designation.'] },
        'Invalid pay grade for designation.',
      );
    }
  }
}

export function parseOptionalUuid(value: string | undefined | null): string | null {
  if (!value) return null;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value) ? value : null;
}

function assertClientScopeForCodeLookup(
  reference: string,
  clientId: string | undefined,
  fieldLabel: string,
): void {
  if (!parseOptionalUuid(reference) && !clientId?.trim()) {
    throw new ValidationError(
      { clientId: [`clientId is required when ${fieldLabel} is a business code.`] },
      `${fieldLabel} code lookup requires clientId.`,
    );
  }
}
