import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import {
  CreateSiteInput,
  SiteDetail,
  SiteFilter,
  SiteListItem,
  SiteSummary,
  UpdateSiteInput,
} from './site.types';

const DEPLOYED_COUNT_SQL = `
  (SELECT COUNT(*)::int FROM employees emp
   WHERE NOT emp.is_deleted AND emp.status IN (1, 3)
   AND COALESCE(
     (SELECT ed2.site_id FROM employee_employment_details ed2
      WHERE ed2.employee_id = emp.id AND ed2.is_current = TRUE LIMIT 1),
     emp.site_id
   ) = s.id)
`;

export class SiteRepository {
  private baseFrom = `
    FROM sites s
    INNER JOIN clients c ON c.id = s.client_id AND NOT c.is_deleted
    WHERE NOT s.is_deleted
  `;

  async findAll(filter: SiteFilter): Promise<PaginatedResult<SiteListItem>> {
    const { extra, params, nextIndex } = this.buildFilter(filter);

    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count ${this.baseFrom}${extra}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT s.id, s.site_code, s.site_name, s.client_id, c.company_name AS client_company_name,
              s.city, s.state, s.required_headcount, s.is_active,
              ${DEPLOYED_COUNT_SQL} AS deployed_headcount
       ${this.baseFrom}${extra}
       ORDER BY s.site_name
       LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map((r) => this.mapListItem(r)),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async findById(id: string): Promise<SiteDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT s.*, c.company_name AS client_company_name,
              ${DEPLOYED_COUNT_SQL} AS deployed_headcount
       ${this.baseFrom} AND s.id = $1`,
      [id],
    );
    return rows[0] ? this.mapDetail(rows[0]) : null;
  }

  async getSummary(): Promise<SiteSummary> {
    const { rows } = await query<Record<string, unknown>>(
      `WITH site_stats AS (
         SELECT s.id, s.is_active, s.required_headcount,
           ${DEPLOYED_COUNT_SQL} AS deployed
         FROM sites s
         WHERE NOT s.is_deleted
       )
       SELECT
         COUNT(*)::int AS total_sites,
         COUNT(*) FILTER (WHERE is_active)::int AS active_sites,
         COALESCE(SUM(required_headcount), 0)::int AS total_headcount_required,
         COALESCE(SUM(deployed), 0)::int AS total_deployed,
         COUNT(*) FILTER (WHERE required_headcount > deployed)::int AS understaffed_sites
       FROM site_stats`,
    );
    const r = rows[0];
    return {
      totalSites: Number(r.total_sites ?? 0),
      activeSites: Number(r.active_sites ?? 0),
      totalHeadcountRequired: Number(r.total_headcount_required ?? 0),
      totalDeployed: Number(r.total_deployed ?? 0),
      understaffedSites: Number(r.understaffed_sites ?? 0),
    };
  }

  async create(input: CreateSiteInput): Promise<{ id: string; siteCode: string }> {
    const countResult = await query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM sites WHERE NOT is_deleted',
    );
    const siteCode = `SITE-${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(4, '0')}`;

    const { rows } = await query<{ id: string }>(
      `INSERT INTO sites (
        site_code, site_name, description, client_id, address, city, state, pin_code,
        contact_person, contact_phone, contact_email, required_headcount,
        billing_rate_per_day, billing_rate_per_month, is_active, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id`,
      [
        siteCode,
        input.siteName,
        input.description ?? null,
        input.clientId,
        input.address,
        input.city,
        input.state,
        input.pinCode ?? '',
        input.contactPerson ?? null,
        input.contactPhone ?? null,
        input.contactEmail ?? null,
        input.requiredHeadcount ?? 0,
        input.billingRatePerDay ?? null,
        input.billingRatePerMonth ?? null,
        input.isActive ?? true,
        input.createdBy,
      ],
    );

    return { id: rows[0].id, siteCode };
  }

  async update(input: UpdateSiteInput): Promise<void> {
    await query(
      `UPDATE sites SET
        site_name = $2, description = $3, client_id = $4, address = $5, city = $6,
        state = $7, pin_code = $8, contact_person = $9, contact_phone = $10,
        contact_email = $11, required_headcount = $12, billing_rate_per_day = $13,
        billing_rate_per_month = $14, is_active = COALESCE($15, is_active),
        updated_at = NOW(), updated_by = $16
       WHERE id = $1 AND NOT is_deleted`,
      [
        input.id,
        input.siteName,
        input.description ?? null,
        input.clientId,
        input.address,
        input.city,
        input.state,
        input.pinCode ?? '',
        input.contactPerson ?? null,
        input.contactPhone ?? null,
        input.contactEmail ?? null,
        input.requiredHeadcount ?? 0,
        input.billingRatePerDay ?? null,
        input.billingRatePerMonth ?? null,
        input.isActive ?? null,
        input.createdBy,
      ],
    );
  }

  async softDelete(id: string, deletedBy: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE sites SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async belongsToClient(siteId: string, clientId: string): Promise<boolean> {
    const { rows } = await query(
      `SELECT 1 FROM sites WHERE id = $1 AND client_id = $2 AND NOT is_deleted`,
      [siteId, clientId],
    );
    return rows.length > 0;
  }

  async getClientIdForSite(siteId: string): Promise<string | null> {
    const { rows } = await query<{ client_id: string }>(
      `SELECT client_id FROM sites WHERE id = $1 AND NOT is_deleted`,
      [siteId],
    );
    return rows[0]?.client_id ?? null;
  }

  private buildFilter(filter: SiteFilter): { extra: string; params: unknown[]; nextIndex: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (filter.search) {
      conditions.push(
        `(LOWER(s.site_name) LIKE $${i} OR LOWER(s.site_code) LIKE $${i} OR LOWER(c.company_name) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.clientId) {
      conditions.push(`s.client_id = $${i++}::uuid`);
      params.push(filter.clientId);
    }

    if (filter.isActive !== undefined) {
      conditions.push(`s.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    const extra = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
    return { extra, params, nextIndex: i };
  }

  private mapListItem(r: Record<string, unknown>): SiteListItem {
    return {
      id: String(r.id),
      siteCode: String(r.site_code),
      siteName: String(r.site_name),
      clientId: String(r.client_id),
      clientCompanyName: String(r.client_company_name),
      city: String(r.city ?? ''),
      state: String(r.state ?? ''),
      requiredHeadcount: Number(r.required_headcount ?? 0),
      deployedHeadcount: Number(r.deployed_headcount ?? 0),
      isActive: Boolean(r.is_active),
    };
  }

  private mapDetail(r: Record<string, unknown>): SiteDetail {
    return {
      ...this.mapListItem(r),
      description: r.description ? String(r.description) : null,
      address: String(r.address ?? ''),
      pinCode: String(r.pin_code ?? ''),
      contactPerson: r.contact_person ? String(r.contact_person) : null,
      contactPhone: r.contact_phone ? String(r.contact_phone) : null,
      contactEmail: r.contact_email ? String(r.contact_email) : null,
      billingRatePerDay: r.billing_rate_per_day != null ? Number(r.billing_rate_per_day) : null,
      billingRatePerMonth: r.billing_rate_per_month != null ? Number(r.billing_rate_per_month) : null,
    };
  }
}

export const siteRepository = new SiteRepository();
