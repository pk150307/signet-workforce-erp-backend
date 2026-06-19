import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { PfEsicDetail, PfEsicListItem, StatutoryFilter, UpsertPfEsicInput } from './statutory.types';
import { formatDate } from '../../utils/formatters';

export class StatutoryRepository {
  private baseJoin = `
    FROM employees e
    INNER JOIN departments d ON d.id = e.department_id
    INNER JOIN designations des ON des.id = e.designation_id
    LEFT JOIN sites s ON s.id = e.site_id
    LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id AND NOT esd.is_deleted
    WHERE NOT e.is_deleted
  `;

  async findAll(filter: StatutoryFilter): Promise<PaginatedResult<PfEsicListItem>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (filter.search) {
      conditions.push(`(
        LOWER(e.first_name || ' ' || e.last_name) LIKE $${i} OR
        LOWER(e.employee_code) LIKE $${i} OR
        LOWER(COALESCE(esd.pf_number, e.pf_number, '')) LIKE $${i} OR
        LOWER(COALESCE(esd.esi_number, e.esi_number, '')) LIKE $${i} OR
        LOWER(COALESCE(esd.uan_number, e.uan_number, '')) LIKE $${i}
      )`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.siteId) {
      conditions.push(`e.site_id = $${i++}::uuid`);
      params.push(filter.siteId);
    }

    if (filter.pfApplicable !== undefined) {
      conditions.push(`COALESCE(esd.is_pf_applicable, TRUE) = $${i++}`);
      params.push(filter.pfApplicable);
    }

    if (filter.esiApplicable !== undefined) {
      conditions.push(`COALESCE(esd.is_esi_applicable, TRUE) = $${i++}`);
      params.push(filter.esiApplicable);
    }

    const extra = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count ${this.baseJoin}${extra}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name, d.name AS department_name,
              des.name AS designation_name, s.site_name, e.pan_number, e.aadhaar_number,
              COALESCE(esd.uan_number, e.uan_number) AS uan_number,
              COALESCE(esd.pf_number, e.pf_number) AS pf_number,
              COALESCE(esd.esi_number, e.esi_number) AS esi_number,
              COALESCE(esd.is_pf_applicable, TRUE) AS is_pf_applicable,
              COALESCE(esd.is_esi_applicable, TRUE) AS is_esi_applicable,
              esd.pf_joining_date, esd.esi_joining_date
       ${this.baseJoin}${extra}
       ORDER BY e.employee_code
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    const items = rows.map((r) => this.mapListItem(r));
    return createPaginatedResult(items, parseInt(count.rows[0].count, 10), filter.page, filter.pageSize);
  }

  async findByEmployeeId(employeeId: string): Promise<PfEsicDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name, d.name AS department_name,
              des.name AS designation_name, s.site_name, e.pan_number, e.aadhaar_number,
              e.bank_name, e.account_number, e.ifsc_code,
              COALESCE(esd.uan_number, e.uan_number) AS uan_number,
              COALESCE(esd.pf_number, e.pf_number) AS pf_number,
              COALESCE(esd.esi_number, e.esi_number) AS esi_number,
              COALESCE(esd.is_pf_applicable, TRUE) AS is_pf_applicable,
              COALESCE(esd.is_esi_applicable, TRUE) AS is_esi_applicable,
              esd.pf_joining_date, esd.pf_exit_date, esd.pf_nominee_name, esd.pf_nominee_relation,
              esd.pf_account_number, esd.employer_pf_percentage, esd.employee_pf_percentage,
              esd.pf_remarks, esd.esi_dispensary, esd.esi_joining_date, esd.esi_exit_date,
              esd.employer_esi_percentage, esd.employee_esi_percentage,
              esd.family_members, esd.esi_remarks
       ${this.baseJoin} AND e.id = $1`,
      [employeeId],
    );

    const r = rows[0];
    if (!r) return null;

    const base = this.mapListItem(r);
    return {
      ...base,
      pfExitDate: formatDate(r.pf_exit_date as string | null),
      pfNomineeName: r.pf_nominee_name ? String(r.pf_nominee_name) : null,
      pfNomineeRelation: r.pf_nominee_relation ? String(r.pf_nominee_relation) : null,
      pfAccountNumber: r.pf_account_number ? String(r.pf_account_number) : null,
      employerPfPercentage: r.employer_pf_percentage ? parseFloat(String(r.employer_pf_percentage)) : 12,
      employeePfPercentage: r.employee_pf_percentage ? parseFloat(String(r.employee_pf_percentage)) : 12,
      pfRemarks: r.pf_remarks ? String(r.pf_remarks) : null,
      esiDispensary: r.esi_dispensary ? String(r.esi_dispensary) : null,
      esiExitDate: formatDate(r.esi_exit_date as string | null),
      employerEsiPercentage: r.employer_esi_percentage ? parseFloat(String(r.employer_esi_percentage)) : 3.25,
      employeeEsiPercentage: r.employee_esi_percentage ? parseFloat(String(r.employee_esi_percentage)) : 0.75,
      familyMembers: Array.isArray(r.family_members) ? (r.family_members as PfEsicDetail['familyMembers']) : [],
      esiRemarks: r.esi_remarks ? String(r.esi_remarks) : null,
      bankName: r.bank_name ? String(r.bank_name) : null,
      accountNumber: r.account_number ? String(r.account_number) : null,
      ifscCode: r.ifsc_code ? String(r.ifsc_code) : null,
    };
  }

  async upsert(input: UpsertPfEsicInput): Promise<void> {
    await query(
      `INSERT INTO employee_statutory_details (
        employee_id, uan_number, pf_number, pf_joining_date, pf_exit_date,
        pf_nominee_name, pf_nominee_relation, pf_account_number,
        employer_pf_percentage, employee_pf_percentage, is_pf_applicable, pf_remarks,
        esi_number, esi_dispensary, esi_joining_date, esi_exit_date,
        is_esi_applicable, employer_esi_percentage, employee_esi_percentage,
        family_members, esi_remarks, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (employee_id) DO UPDATE SET
        uan_number = EXCLUDED.uan_number, pf_number = EXCLUDED.pf_number,
        pf_joining_date = EXCLUDED.pf_joining_date, pf_exit_date = EXCLUDED.pf_exit_date,
        pf_nominee_name = EXCLUDED.pf_nominee_name, pf_nominee_relation = EXCLUDED.pf_nominee_relation,
        pf_account_number = EXCLUDED.pf_account_number,
        employer_pf_percentage = EXCLUDED.employer_pf_percentage,
        employee_pf_percentage = EXCLUDED.employee_pf_percentage,
        is_pf_applicable = EXCLUDED.is_pf_applicable, pf_remarks = EXCLUDED.pf_remarks,
        esi_number = EXCLUDED.esi_number, esi_dispensary = EXCLUDED.esi_dispensary,
        esi_joining_date = EXCLUDED.esi_joining_date, esi_exit_date = EXCLUDED.esi_exit_date,
        is_esi_applicable = EXCLUDED.is_esi_applicable,
        employer_esi_percentage = EXCLUDED.employer_esi_percentage,
        employee_esi_percentage = EXCLUDED.employee_esi_percentage,
        family_members = EXCLUDED.family_members, esi_remarks = EXCLUDED.esi_remarks,
        updated_at = NOW(), updated_by = EXCLUDED.created_by`,
      [
        input.employeeId,
        input.uanNumber ?? null,
        input.pfNumber ?? null,
        input.pfJoiningDate ?? null,
        input.pfExitDate ?? null,
        input.pfNomineeName ?? null,
        input.pfNomineeRelation ?? null,
        input.pfAccountNumber ?? null,
        input.employerPfPercentage ?? 12,
        input.employeePfPercentage ?? 12,
        input.isPfApplicable ?? true,
        input.pfRemarks ?? null,
        input.esiNumber ?? null,
        input.esiDispensary ?? null,
        input.esiJoiningDate ?? null,
        input.esiExitDate ?? null,
        input.isEsiApplicable ?? true,
        input.employerEsiPercentage ?? 3.25,
        input.employeeEsiPercentage ?? 0.75,
        JSON.stringify(input.familyMembers ?? []),
        input.esiRemarks ?? null,
        input.updatedBy,
      ],
    );

    await query(
      `UPDATE employees SET
        uan_number = COALESCE($2, uan_number), pf_number = COALESCE($3, pf_number),
        esi_number = COALESCE($4, esi_number), pan_number = COALESCE($5, pan_number),
        aadhaar_number = COALESCE($6, aadhaar_number), updated_at = NOW(), updated_by = $7
       WHERE id = $1`,
      [
        input.employeeId,
        input.uanNumber ?? null,
        input.pfNumber ?? null,
        input.esiNumber ?? null,
        input.panNumber ?? null,
        input.aadhaarNumber ?? null,
        input.updatedBy,
      ],
    );
  }

  async employeeExists(employeeId: string): Promise<boolean> {
    const { rows } = await query('SELECT 1 FROM employees WHERE id = $1 AND NOT is_deleted', [employeeId]);
    return rows.length > 0;
  }

  private mapListItem(r: Record<string, unknown>): PfEsicListItem {
    return {
      employeeId: String(r.id),
      employeeCode: String(r.employee_code),
      fullName: `${r.first_name} ${r.last_name}`,
      department: String(r.department_name),
      designation: String(r.designation_name),
      siteName: r.site_name ? String(r.site_name) : null,
      panNumber: r.pan_number ? String(r.pan_number) : null,
      aadhaarNumber: r.aadhaar_number ? String(r.aadhaar_number) : null,
      uanNumber: r.uan_number ? String(r.uan_number) : null,
      pfNumber: r.pf_number ? String(r.pf_number) : null,
      esiNumber: r.esi_number ? String(r.esi_number) : null,
      isPfApplicable: Boolean(r.is_pf_applicable),
      isEsiApplicable: Boolean(r.is_esi_applicable),
      pfJoiningDate: formatDate(r.pf_joining_date as string | null),
      esiJoiningDate: formatDate(r.esi_joining_date as string | null),
    };
  }
}

export const statutoryRepository = new StatutoryRepository();
