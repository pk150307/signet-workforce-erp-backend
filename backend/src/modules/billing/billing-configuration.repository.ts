import { query, withTransaction } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import {
  BillingComponentDto,
  BillingConfigurationComponentDto,
  BillingConfigurationDetail,
  BillingConfigurationFilter,
  BillingConfigurationListItem,
  CreateBillingConfigurationInput,
  UpdateBillingConfigurationInput,
} from './billing-configuration.types';

const LIST_SELECT = `
  bc.id, bc.client_id, bc.site_id, bc.billing_type, bc.billing_cycle, bc.billing_rate,
  bc.required_headcount, bc.gst_pct, bc.gst_type, bc.service_charge_pct,
  bc.invoice_prefix, bc.invoice_due_days, bc.sac_code, bc.is_active, bc.contract_id,
  bc.created_at, bc.updated_at,
  c.company_name AS client_name, c.client_code,
  s.site_name, s.site_code,
  ct.contract_name
`;

function mapListRow(r: Record<string, unknown>): BillingConfigurationListItem {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    clientName: String(r.client_name),
    clientCode: String(r.client_code),
    siteId: String(r.site_id),
    siteName: String(r.site_name),
    siteCode: String(r.site_code),
    billingType: String(r.billing_type),
    billingCycle: String(r.billing_cycle),
    billingRate: r.billing_rate != null ? Number(r.billing_rate) : null,
    requiredHeadcount: r.required_headcount != null ? Number(r.required_headcount) : null,
    gstPct: Number(r.gst_pct),
    gstType: String(r.gst_type),
    serviceChargePct: Number(r.service_charge_pct),
    invoicePrefix: r.invoice_prefix ? String(r.invoice_prefix) : null,
    invoiceDueDays: Number(r.invoice_due_days),
    sacCode: String(r.sac_code),
    isActive: Boolean(r.is_active),
    contractId: r.contract_id ? String(r.contract_id) : null,
    contractName: r.contract_name ? String(r.contract_name) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
  };
}

function mapComponentRow(r: Record<string, unknown>): BillingConfigurationComponentDto {
  return {
    id: String(r.id),
    billingComponentId: String(r.billing_component_id),
    code: String(r.code),
    name: String(r.name),
    componentType: String(r.component_type),
    isEnabled: Boolean(r.is_enabled),
    sortOrder: Number(r.sort_order),
    rateOverride: r.rate_override != null ? Number(r.rate_override) : null,
    pctOverride: r.pct_override != null ? Number(r.pct_override) : null,
    hsnSacCode: r.hsn_sac_code ? String(r.hsn_sac_code) : null,
    isTaxable: Boolean(r.is_taxable),
  };
}

function mapComponentMaster(r: Record<string, unknown>): BillingComponentDto {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    componentType: String(r.component_type),
    sortOrder: Number(r.sort_order),
    isSystem: Boolean(r.is_system),
    isEnabledByDefault: Boolean(r.is_enabled_by_default),
    isTaxable: Boolean(r.is_taxable),
    hsnSacCode: r.hsn_sac_code ? String(r.hsn_sac_code) : null,
  };
}

export class BillingConfigurationRepository {
  async findAll(filter: BillingConfigurationFilter): Promise<PaginatedResult<BillingConfigurationListItem>> {
    const conditions = ['NOT bc.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.clientId) {
      conditions.push(`bc.client_id = $${i++}`);
      params.push(filter.clientId);
    }
    if (filter.siteId) {
      conditions.push(`bc.site_id = $${i++}`);
      params.push(filter.siteId);
    }
    if (filter.isActive !== undefined) {
      conditions.push(`bc.is_active = $${i++}`);
      params.push(filter.isActive);
    }
    if (filter.search) {
      conditions.push(
        `(LOWER(c.company_name) LIKE $${i}
          OR LOWER(s.site_name) LIKE $${i}
          OR LOWER(s.site_code) LIKE $${i}
          OR LOWER(c.client_code) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM billing_configurations bc
       INNER JOIN clients c ON c.id = bc.client_id AND NOT c.is_deleted
       INNER JOIN sites s ON s.id = bc.site_id AND NOT s.is_deleted
       LEFT JOIN contracts ct ON ct.id = bc.contract_id AND NOT ct.is_deleted
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${LIST_SELECT}
       FROM billing_configurations bc
       INNER JOIN clients c ON c.id = bc.client_id AND NOT c.is_deleted
       INNER JOIN sites s ON s.id = bc.site_id AND NOT s.is_deleted
       LEFT JOIN contracts ct ON ct.id = bc.contract_id AND NOT ct.is_deleted
       WHERE ${where}
       ORDER BY c.company_name, s.site_name
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    return createPaginatedResult(
      rows.map(mapListRow),
      parseInt(count.rows[0].count, 10),
      filter.page,
      filter.pageSize,
    );
  }

  async findById(id: string): Promise<BillingConfigurationDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${LIST_SELECT},
              bc.pf_pct, bc.esic_pct, bc.lwf_pct, bc.invoice_notes, bc.nature_of_service
       FROM billing_configurations bc
       INNER JOIN clients c ON c.id = bc.client_id AND NOT c.is_deleted
       INNER JOIN sites s ON s.id = bc.site_id AND NOT s.is_deleted
       LEFT JOIN contracts ct ON ct.id = bc.contract_id AND NOT ct.is_deleted
       WHERE bc.id = $1 AND NOT bc.is_deleted`,
      [id],
    );
    if (!rows[0]) return null;

    const base = mapListRow(rows[0]);
    const components = await this.getComponents(id);

    return {
      ...base,
      pfPct: rows[0].pf_pct != null ? Number(rows[0].pf_pct) : null,
      esicPct: rows[0].esic_pct != null ? Number(rows[0].esic_pct) : null,
      lwfPct: rows[0].lwf_pct != null ? Number(rows[0].lwf_pct) : null,
      invoiceNotes: rows[0].invoice_notes ? String(rows[0].invoice_notes) : null,
      natureOfService: rows[0].nature_of_service ? String(rows[0].nature_of_service) : null,
      components,
    };
  }

  async findBySiteId(siteId: string): Promise<BillingConfigurationDetail | null> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM billing_configurations WHERE site_id = $1 AND NOT is_deleted`,
      [siteId],
    );
    if (!rows[0]) return null;
    return this.findById(rows[0].id);
  }

  async existsForSite(siteId: string, excludeId?: string): Promise<boolean> {
    const params: unknown[] = [siteId];
    let sql = `SELECT 1 FROM billing_configurations WHERE site_id = $1 AND NOT is_deleted`;
    if (excludeId) {
      sql += ` AND id <> $2`;
      params.push(excludeId);
    }
    const { rows } = await query(sql, params);
    return rows.length > 0;
  }

  async getComponents(configId: string): Promise<BillingConfigurationComponentDto[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT bcc.id, bcc.billing_component_id, bcc.is_enabled, bcc.sort_order,
              bcc.rate_override, bcc.pct_override,
              comp.code, comp.name, comp.component_type, comp.hsn_sac_code, comp.is_taxable
       FROM billing_configuration_components bcc
       INNER JOIN billing_components comp ON comp.id = bcc.billing_component_id AND NOT comp.is_deleted
       WHERE bcc.billing_configuration_id = $1
       ORDER BY bcc.sort_order, comp.sort_order`,
      [configId],
    );
    return rows.map(mapComponentRow);
  }

  async listMasterComponents(): Promise<BillingComponentDto[]> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, code, name, description, component_type, sort_order,
              is_system, is_enabled_by_default, is_taxable, hsn_sac_code
       FROM billing_components
       WHERE NOT is_deleted
       ORDER BY sort_order, name`,
    );
    return rows.map(mapComponentMaster);
  }


  async syncSiteBillingFields(
    siteId: string,
    billingType: string,
    billingRate: number | null | undefined,
    requiredHeadcount: number | null | undefined,
    updatedBy: string,
  ): Promise<void> {
    const dailyRate = billingType === 'daily' ? billingRate ?? null : null;
    const monthlyRate = billingType === 'monthly' ? billingRate ?? null : null;

    await query(
      `UPDATE sites
       SET required_headcount = COALESCE($2, required_headcount),
           billing_rate_per_day = CASE WHEN $3::varchar = 'daily' THEN $4 ELSE billing_rate_per_day END,
           billing_rate_per_month = CASE WHEN $3::varchar = 'monthly' THEN $4 ELSE billing_rate_per_month END,
           updated_at = NOW(),
           updated_by = $5
       WHERE id = $1 AND NOT is_deleted`,
      [siteId, requiredHeadcount ?? null, billingType, billingRate ?? null, updatedBy],
    );

    // Keep both rate columns populated when only one billing type is used
    if (billingType === 'monthly' && monthlyRate != null) {
      await query(
        `UPDATE sites SET billing_rate_per_month = $2, updated_at = NOW(), updated_by = $3
         WHERE id = $1 AND NOT is_deleted`,
        [siteId, monthlyRate, updatedBy],
      );
    }
    if (billingType === 'daily' && dailyRate != null) {
      await query(
        `UPDATE sites SET billing_rate_per_day = $2, updated_at = NOW(), updated_by = $3
         WHERE id = $1 AND NOT is_deleted`,
        [siteId, dailyRate, updatedBy],
      );
    }
  }

  async create(input: CreateBillingConfigurationInput): Promise<BillingConfigurationDetail> {
    return withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO billing_configurations (
          client_id, site_id, billing_type, required_headcount, billing_rate,
          service_charge_pct, pf_pct, esic_pct, lwf_pct, gst_pct, gst_type,
          invoice_prefix, billing_cycle, invoice_due_days, invoice_notes, sac_code,
          nature_of_service, contract_id, is_active, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        RETURNING id`,
        [
          input.clientId,
          input.siteId,
          input.billingType ?? 'monthly',
          input.requiredHeadcount ?? null,
          input.billingRate ?? null,
          input.serviceChargePct ?? 0,
          input.pfPct ?? null,
          input.esicPct ?? null,
          input.lwfPct ?? null,
          input.gstPct ?? 18,
          input.gstType ?? 'cgst_sgst',
          input.invoicePrefix ?? null,
          input.billingCycle ?? 'monthly',
          input.invoiceDueDays ?? 30,
          input.invoiceNotes ?? null,
          input.sacCode ?? '998519',
          input.natureOfService ?? 'Manpower Supply Services',
          input.contractId ?? null,
          input.isActive ?? true,
          input.createdBy,
        ],
      );

      const configId = rows[0].id;

      if (input.components?.length) {
        for (const item of input.components) {
          await client.query(
            `INSERT INTO billing_configuration_components (
              billing_configuration_id, billing_component_id, is_enabled, sort_order,
              rate_override, pct_override, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (billing_configuration_id, billing_component_id) DO NOTHING`,
            [
              configId,
              item.billingComponentId,
              item.isEnabled,
              item.sortOrder ?? 0,
              item.rateOverride ?? null,
              item.pctOverride ?? null,
              input.createdBy,
            ],
          );
        }
      } else {
        await client.query(
          `INSERT INTO billing_configuration_components (
            billing_configuration_id, billing_component_id, is_enabled, sort_order, created_by
          )
          SELECT $1, comp.id, comp.is_enabled_by_default, comp.sort_order, $2
          FROM billing_components comp
          WHERE NOT comp.is_deleted AND comp.is_enabled_by_default
          ON CONFLICT (billing_configuration_id, billing_component_id) DO NOTHING`,
          [configId, input.createdBy],
        );
      }

      return configId;
    }).then((id) => this.findById(id) as Promise<BillingConfigurationDetail>);
  }

  async update(input: UpdateBillingConfigurationInput): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE billing_configurations SET
          client_id = $2,
          site_id = $3,
          billing_type = $4,
          required_headcount = $5,
          billing_rate = $6,
          service_charge_pct = $7,
          pf_pct = $8,
          esic_pct = $9,
          lwf_pct = $10,
          gst_pct = $11,
          gst_type = $12,
          invoice_prefix = $13,
          billing_cycle = $14,
          invoice_due_days = $15,
          invoice_notes = $16,
          sac_code = $17,
          nature_of_service = $18,
          contract_id = $19,
          is_active = COALESCE($20, is_active),
          updated_at = NOW(),
          updated_by = $21
        WHERE id = $1 AND NOT is_deleted`,
        [
          input.id,
          input.clientId,
          input.siteId,
          input.billingType ?? 'monthly',
          input.requiredHeadcount ?? null,
          input.billingRate ?? null,
          input.serviceChargePct ?? 0,
          input.pfPct ?? null,
          input.esicPct ?? null,
          input.lwfPct ?? null,
          input.gstPct ?? 18,
          input.gstType ?? 'cgst_sgst',
          input.invoicePrefix ?? null,
          input.billingCycle ?? 'monthly',
          input.invoiceDueDays ?? 30,
          input.invoiceNotes ?? null,
          input.sacCode ?? '998519',
          input.natureOfService ?? 'Manpower Supply Services',
          input.contractId ?? null,
          input.isActive,
          input.updatedBy,
        ],
      );

      if (input.components?.length) {
        for (const item of input.components) {
          await client.query(
            `INSERT INTO billing_configuration_components (
              billing_configuration_id, billing_component_id, is_enabled, sort_order,
              rate_override, pct_override, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (billing_configuration_id, billing_component_id)
            DO UPDATE SET
              is_enabled = EXCLUDED.is_enabled,
              sort_order = EXCLUDED.sort_order,
              rate_override = EXCLUDED.rate_override,
              pct_override = EXCLUDED.pct_override,
              updated_at = NOW(),
              updated_by = EXCLUDED.created_by`,
            [
              input.id,
              item.billingComponentId,
              item.isEnabled,
              item.sortOrder ?? 0,
              item.rateOverride ?? null,
              item.pctOverride ?? null,
              input.updatedBy,
            ],
          );
        }
      }
    });
  }

  async softDelete(id: string, deletedBy: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE billing_configurations
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }
}

export const billingConfigurationRepository = new BillingConfigurationRepository();
