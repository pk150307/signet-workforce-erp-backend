import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { PfEsicDetail, PfEsicListItem, PfEsicStatus, PF_ESIC_EXPORT_HEADERS, StatutoryFilter, UpsertPfEsicInput } from './statutory.types';
import { formatDate } from '../../utils/formatters';
import { EmployeeLifecycleStatus } from '../employee/employee.constants';

export class StatutoryRepository {
  private baseJoin = `
    FROM employees e
    INNER JOIN departments d ON d.id = e.department_id
    INNER JOIN designations des ON des.id = e.designation_id
    LEFT JOIN sites s ON s.id = e.site_id
    LEFT JOIN clients c ON c.id = s.client_id AND NOT c.is_deleted
    LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id AND NOT esd.is_deleted
    WHERE NOT e.is_deleted
  `;

  private listSelect = `
    SELECT e.id, e.employee_code, e.first_name, e.last_name, e.status AS employee_status,
           d.name AS department_name,
           des.name AS designation_name, s.site_name, c.company_name AS client_company_name,
           e.pan_number, e.aadhaar_number,
           COALESCE(esd.uan_number, e.uan_number) AS uan_number,
           COALESCE(esd.pf_number, e.pf_number) AS pf_number,
           COALESCE(esd.esi_number, e.esi_number) AS esi_number,
           COALESCE(esd.is_pf_applicable, TRUE) AS is_pf_applicable,
           COALESCE(esd.is_esi_applicable, TRUE) AS is_esi_applicable,
           esd.pf_joining_date, esd.esi_joining_date, esd.status, esd.id AS statutory_id
  `;

  private buildFilter(filter: StatutoryFilter): { extra: string; params: unknown[]; nextIndex: number } {
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

    if (filter.clientId) {
      conditions.push(`s.client_id = $${i++}::uuid`);
      params.push(filter.clientId);
    }

    if (filter.department) {
      conditions.push(`d.name = $${i++}`);
      params.push(filter.department);
    }

    if (filter.employeeStatus !== 'all' && filter.employeeStatus !== undefined) {
      conditions.push(`e.status = $${i++}`);
      params.push(filter.employeeStatus);
    }

    if (filter.status) {
      conditions.push(`(
        CASE
          WHEN LOWER(COALESCE(esd.status, '')) = 'inactive' THEN 'Inactive'
          WHEN LOWER(COALESCE(esd.status, '')) = 'pending' THEN 'Pending'
          WHEN LOWER(COALESCE(esd.status, '')) = 'suspended' THEN 'Suspended'
          ELSE 'Active'
        END
      ) = $${i++}`);
      params.push(filter.status);
    }

    if (filter.hasUan === true) {
      conditions.push(`COALESCE(NULLIF(esd.uan_number, ''), NULLIF(e.uan_number, ''), '') <> ''`);
    } else if (filter.hasUan === false) {
      conditions.push(`COALESCE(NULLIF(esd.uan_number, ''), NULLIF(e.uan_number, ''), '') = ''`);
    }

    if (filter.hasPf === true) {
      conditions.push(`COALESCE(NULLIF(esd.pf_number, ''), NULLIF(e.pf_number, ''), '') <> ''`);
    } else if (filter.hasPf === false) {
      conditions.push(`COALESCE(NULLIF(esd.pf_number, ''), NULLIF(e.pf_number, ''), '') = ''`);
    }

    if (filter.hasEsic === true) {
      conditions.push(`COALESCE(NULLIF(esd.esi_number, ''), NULLIF(e.esi_number, ''), '') <> ''`);
    } else if (filter.hasEsic === false) {
      conditions.push(`COALESCE(NULLIF(esd.esi_number, ''), NULLIF(e.esi_number, ''), '') = ''`);
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
    return { extra, params, nextIndex: i };
  }

  private buildOrderBy(sortBy?: string, sortDir?: 'asc' | 'desc'): string {
    const direction = sortDir === 'desc' ? 'DESC' : 'ASC';
    const columns: Record<string, string> = {
      employeeCode: 'e.employee_code',
      fullName: `e.first_name || ' ' || e.last_name`,
      department: 'd.name',
      clientCompanyName: 'c.company_name',
      aadhaarNumber: 'e.aadhaar_number',
      uanNumber: 'COALESCE(esd.uan_number, e.uan_number)',
      pfNumber: 'COALESCE(esd.pf_number, e.pf_number)',
      esicNumber: 'COALESCE(esd.esi_number, e.esi_number)',
      status: `CASE
        WHEN LOWER(COALESCE(esd.status, '')) = 'inactive' THEN 'Inactive'
        WHEN LOWER(COALESCE(esd.status, '')) = 'pending' THEN 'Pending'
        WHEN LOWER(COALESCE(esd.status, '')) = 'suspended' THEN 'Suspended'
        ELSE 'Active'
      END`,
      effectiveDate: 'COALESCE(esd.pf_joining_date, esd.esi_joining_date)',
    };
    const column = columns[sortBy ?? 'fullName'] ?? columns.fullName;
    return `${column} ${direction}, e.employee_code ASC`;
  }

  async findAll(filter: StatutoryFilter): Promise<PaginatedResult<PfEsicListItem>> {
    const { extra, params, nextIndex } = this.buildFilter(filter);

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count ${this.baseJoin}${extra}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `${this.listSelect}
       ${this.baseJoin}${extra}
       ORDER BY ${this.buildOrderBy(filter.sortBy, filter.sortDir)}
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    const items = rows.map((r) => this.mapListItem(r));
    return createPaginatedResult(items, parseInt(count.rows[0].count, 10), filter.page, filter.pageSize);
  }

  async exportCsv(filter: StatutoryFilter): Promise<string> {
    const { extra, params } = this.buildFilter(filter);

    const { rows } = await query<Record<string, unknown>>(
      `${this.listSelect}
       ${this.baseJoin}${extra}
       ORDER BY ${this.buildOrderBy(filter.sortBy, filter.sortDir)}`,
      params,
    );

    const escape = (value: unknown) => {
      const str = value == null ? '' : String(value);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines = [PF_ESIC_EXPORT_HEADERS.join(',')];
    for (const r of rows) {
      const item = this.mapListItem(r);
      lines.push(
        [
          item.employeeCode,
          item.fullName,
          item.clientCompanyName ?? '',
          item.designation,
          item.siteName ?? '',
          item.aadhaarNumber ?? '',
          item.uanNumber ?? '',
          item.pfNumber ?? '',
          item.esicNumber ?? '',
          item.panNumber ?? '',
          item.status,
          item.effectiveDate ?? '',
        ]
          .map(escape)
          .join(','),
      );
    }

    return lines.join('\n');
  }

  async findByEmployeeId(employeeId: string): Promise<PfEsicDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name, e.status AS employee_status,
              d.name AS department_name,
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
              esd.family_members, esd.esi_remarks, esd.status, esd.id AS statutory_id
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
    const { rows: existingRows } = await query<Record<string, unknown>>(
      `SELECT * FROM employee_statutory_details WHERE employee_id = $1 AND NOT is_deleted`,
      [input.employeeId],
    );
    const existing = existingRows[0];

    const effectiveDate = input.effectiveDate ?? input.pfJoiningDate ?? input.esiJoiningDate;
    const pfJoiningDate =
      input.pfJoiningDate ?? effectiveDate ?? (existing?.pf_joining_date as string | null) ?? null;
    const esiJoiningDate =
      input.esiJoiningDate ?? effectiveDate ?? (existing?.esi_joining_date as string | null) ?? null;
    const dbStatus = this.toDbStatus(input.status, existing?.status as string | undefined);

    let isPfApplicable =
      input.isPfApplicable ??
      (existing?.is_pf_applicable !== undefined ? Boolean(existing.is_pf_applicable) : true);
    let isEsiApplicable =
      input.isEsiApplicable ??
      (existing?.is_esi_applicable !== undefined ? Boolean(existing.is_esi_applicable) : true);

    if (input.status) {
      const normalized = String(input.status).toLowerCase();
      if (normalized === 'active') {
        isPfApplicable = true;
        isEsiApplicable = true;
      } else if (normalized === 'inactive' || normalized === 'suspended') {
        isPfApplicable = false;
        isEsiApplicable = false;
      }
    }

    const merged = {
      uanNumber: input.uanNumber !== undefined ? input.uanNumber : (existing?.uan_number as string | null) ?? null,
      pfNumber: input.pfNumber !== undefined ? input.pfNumber : (existing?.pf_number as string | null) ?? null,
      pfExitDate: input.pfExitDate !== undefined ? input.pfExitDate : (existing?.pf_exit_date as string | null) ?? null,
      pfNomineeName:
        input.pfNomineeName !== undefined
          ? input.pfNomineeName
          : (existing?.pf_nominee_name as string | null) ?? null,
      pfNomineeRelation:
        input.pfNomineeRelation !== undefined
          ? input.pfNomineeRelation
          : (existing?.pf_nominee_relation as string | null) ?? null,
      pfAccountNumber:
        input.pfAccountNumber !== undefined
          ? input.pfAccountNumber
          : (existing?.pf_account_number as string | null) ?? null,
      employerPfPercentage:
        input.employerPfPercentage ??
        (existing?.employer_pf_percentage ? parseFloat(String(existing.employer_pf_percentage)) : 12),
      employeePfPercentage:
        input.employeePfPercentage ??
        (existing?.employee_pf_percentage ? parseFloat(String(existing.employee_pf_percentage)) : 12),
      pfRemarks: input.pfRemarks !== undefined ? input.pfRemarks : (existing?.pf_remarks as string | null) ?? null,
      esiNumber: input.esiNumber !== undefined ? input.esiNumber : (existing?.esi_number as string | null) ?? null,
      esiDispensary:
        input.esiDispensary !== undefined
          ? input.esiDispensary
          : (existing?.esi_dispensary as string | null) ?? null,
      esiExitDate: input.esiExitDate !== undefined ? input.esiExitDate : (existing?.esi_exit_date as string | null) ?? null,
      employerEsiPercentage:
        input.employerEsiPercentage ??
        (existing?.employer_esi_percentage ? parseFloat(String(existing.employer_esi_percentage)) : 3.25),
      employeeEsiPercentage:
        input.employeeEsiPercentage ??
        (existing?.employee_esi_percentage ? parseFloat(String(existing.employee_esi_percentage)) : 0.75),
      familyMembers:
        input.familyMembers !== undefined
          ? input.familyMembers
          : Array.isArray(existing?.family_members)
            ? (existing.family_members as UpsertPfEsicInput['familyMembers'])
            : [],
      esiRemarks: input.esiRemarks !== undefined ? input.esiRemarks : (existing?.esi_remarks as string | null) ?? null,
    };

    await query(
      `INSERT INTO employee_statutory_details (
        employee_id, uan_number, pf_number, pf_joining_date, pf_exit_date,
        pf_nominee_name, pf_nominee_relation, pf_account_number,
        employer_pf_percentage, employee_pf_percentage, is_pf_applicable, pf_remarks,
        esi_number, esi_dispensary, esi_joining_date, esi_exit_date,
        is_esi_applicable, employer_esi_percentage, employee_esi_percentage,
        family_members, esi_remarks, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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
        status = EXCLUDED.status,
        updated_at = NOW(), updated_by = EXCLUDED.created_by`,
      [
        input.employeeId,
        merged.uanNumber,
        merged.pfNumber,
        pfJoiningDate,
        merged.pfExitDate,
        merged.pfNomineeName,
        merged.pfNomineeRelation,
        merged.pfAccountNumber,
        merged.employerPfPercentage,
        merged.employeePfPercentage,
        isPfApplicable,
        merged.pfRemarks,
        merged.esiNumber,
        merged.esiDispensary,
        esiJoiningDate,
        merged.esiExitDate,
        isEsiApplicable,
        merged.employerEsiPercentage,
        merged.employeeEsiPercentage,
        JSON.stringify(merged.familyMembers ?? []),
        merged.esiRemarks,
        dbStatus,
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

  private toDbStatus(status?: PfEsicStatus | string | null, existing?: string): string {
    if (status) return String(status).toLowerCase();
    return existing ?? 'active';
  }

  private toDisplayStatus(
    dbStatus: string | null | undefined,
    isPfApplicable: boolean,
    isEsiApplicable: boolean,
    employeeStatus: number,
  ): PfEsicStatus {
    if (employeeStatus === EmployeeLifecycleStatus.Left) return 'Inactive';
    if (employeeStatus === EmployeeLifecycleStatus.Draft) return 'Pending';
    const normalized = (dbStatus ?? '').toLowerCase();
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'suspended') return 'Suspended';
    if (normalized === 'active') return 'Active';
    return isPfApplicable || isEsiApplicable ? 'Active' : 'Inactive';
  }

  private mapListItem(r: Record<string, unknown>): PfEsicListItem {
    const esiNumber = r.esi_number ? String(r.esi_number) : null;
    const pfJoiningDate = formatDate(r.pf_joining_date as string | null);
    const esiJoiningDate = formatDate(r.esi_joining_date as string | null);
    const isPfApplicable = Boolean(r.is_pf_applicable);
    const isEsiApplicable = Boolean(r.is_esi_applicable);
    const employeeStatus = Number(r.employee_status);

    return {
      id: String(r.statutory_id ?? r.id),
      employeeId: String(r.id),
      employeeCode: String(r.employee_code),
      fullName: `${r.first_name} ${r.last_name}`,
      department: String(r.department_name),
      designation: String(r.designation_name),
      clientCompanyName: r.client_company_name ? String(r.client_company_name) : null,
      siteName: r.site_name ? String(r.site_name) : null,
      panNumber: r.pan_number ? String(r.pan_number) : null,
      aadhaarNumber: r.aadhaar_number ? String(r.aadhaar_number) : null,
      uanNumber: r.uan_number ? String(r.uan_number) : null,
      pfNumber: r.pf_number ? String(r.pf_number) : null,
      esiNumber,
      esicNumber: esiNumber,
      isPfApplicable,
      isEsiApplicable,
      pfJoiningDate,
      esiJoiningDate,
      effectiveDate: pfJoiningDate ?? esiJoiningDate,
      status: this.toDisplayStatus(
        r.status as string | null,
        isPfApplicable,
        isEsiApplicable,
        employeeStatus,
      ),
    };
  }
}

export const statutoryRepository = new StatutoryRepository();
