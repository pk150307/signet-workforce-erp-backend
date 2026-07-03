import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import { buildNextSequentialCode } from '../../utils/code-sequence';
import {
  ContractDetail,
  ContractFilter,
  ContractListItem,
  ContractSummary,
  CreateContractInput,
  PenaltyRule,
  UpdateContractInput,
} from './contract.types';

const LIST_SELECT = `
  ct.id, ct.client_id, ct.site_id, ct.contract_code, ct.contract_name,
  ct.start_date, ct.end_date, ct.billing_type, ct.billing_rate,
  ct.pf_pct, ct.esic_pct, ct.lwf_pct,
  ct.service_charge_pct, ct.gst_pct, ct.invoice_frequency, ct.invoice_prefix,
  ct.status, ct.created_at, ct.updated_at,
  c.company_name AS client_name, c.client_code,
  s.site_name, s.site_code
`;

function parsePenaltyRules(value: unknown): PenaltyRule[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as PenaltyRule[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as PenaltyRule[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isActivePeriod(startDate: string, endDate: string | null, status: string): boolean {
  if (status !== 'active') return false;
  const today = new Date().toISOString().slice(0, 10);
  if (startDate > today) return false;
  if (endDate && endDate < today) return false;
  return true;
}

function mapListRow(r: Record<string, unknown>): ContractListItem {
  const startDate = String(r.start_date).slice(0, 10);
  const endDate = r.end_date ? String(r.end_date).slice(0, 10) : null;
  const status = String(r.status);

  return {
    id: String(r.id),
    clientId: String(r.client_id),
    clientName: String(r.client_name),
    clientCode: String(r.client_code),
    siteId: r.site_id ? String(r.site_id) : null,
    siteName: r.site_name ? String(r.site_name) : null,
    siteCode: r.site_code ? String(r.site_code) : null,
    contractCode: String(r.contract_code),
    contractName: String(r.contract_name),
    startDate,
    endDate,
    billingType: String(r.billing_type),
    billingRate: r.billing_rate != null ? Number(r.billing_rate) : null,
    pfPct: r.pf_pct != null ? Number(r.pf_pct) : null,
    esicPct: r.esic_pct != null ? Number(r.esic_pct) : null,
    lwfPct: r.lwf_pct != null ? Number(r.lwf_pct) : null,
    serviceChargePct: Number(r.service_charge_pct),
    gstPct: Number(r.gst_pct),
    invoiceFrequency: String(r.invoice_frequency),
    invoicePrefix: r.invoice_prefix ? String(r.invoice_prefix) : null,
    status,
    isActivePeriod: isActivePeriod(startDate, endDate, status),
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
  };
}

export class ContractRepository {
  async expireDueContracts(): Promise<number> {
    const { rowCount } = await query(
      `UPDATE contracts
       SET status = 'expired', updated_at = NOW(), updated_by = 'System'
       WHERE status = 'active'
         AND end_date IS NOT NULL
         AND end_date < CURRENT_DATE
         AND NOT is_deleted`,
    );
    return rowCount ?? 0;
  }

  async nextContractCode(clientId: string): Promise<string> {
    const client = await query<{ client_code: string }>(
      `SELECT client_code FROM clients WHERE id = $1 AND NOT is_deleted`,
      [clientId],
    );
    const clientCode = client.rows[0]?.client_code ?? 'CLT';
    const prefix = `${clientCode}-CON-`;

    const { rows } = await query<{ contract_code: string }>(
      `SELECT contract_code FROM contracts WHERE client_id = $1 AND NOT is_deleted`,
      [clientId],
    );

    return buildNextSequentialCode(
      rows.map((r) => r.contract_code),
      prefix,
      3,
    );
  }

  async findAll(filter: ContractFilter): Promise<PaginatedResult<ContractListItem>> {
    const conditions = ['NOT ct.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.clientId) {
      conditions.push(`ct.client_id = $${i++}`);
      params.push(filter.clientId);
    }
    if (filter.siteId) {
      conditions.push(`ct.site_id = $${i++}`);
      params.push(filter.siteId);
    }
    if (filter.status) {
      conditions.push(`ct.status = $${i++}`);
      params.push(filter.status);
    }
    if (filter.activeOnly) {
      conditions.push(`ct.status = 'active'`);
      conditions.push(`ct.start_date <= CURRENT_DATE`);
      conditions.push(`(ct.end_date IS NULL OR ct.end_date >= CURRENT_DATE)`);
    }
    if (filter.search) {
      conditions.push(
        `(LOWER(ct.contract_name) LIKE $${i}
          OR LOWER(ct.contract_code) LIKE $${i}
          OR LOWER(c.company_name) LIKE $${i}
          OR LOWER(COALESCE(s.site_name, '')) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM contracts ct
       INNER JOIN clients c ON c.id = ct.client_id AND NOT c.is_deleted
       LEFT JOIN sites s ON s.id = ct.site_id AND NOT s.is_deleted
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${LIST_SELECT}
       FROM contracts ct
       INNER JOIN clients c ON c.id = ct.client_id AND NOT c.is_deleted
       LEFT JOIN sites s ON s.id = ct.site_id AND NOT s.is_deleted
       WHERE ${where}
       ORDER BY ct.start_date DESC, ct.contract_name
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

  async getSummary(clientId?: string): Promise<ContractSummary> {
    const params: unknown[] = [];
    let clientFilter = '';
    if (clientId) {
      clientFilter = 'AND client_id = $1';
      params.push(clientId);
    }

    const { rows } = await query<{
      total: string;
      draft: string;
      active: string;
      expired: string;
      terminated: string;
      cancelled: string;
      expiring_within_30: string;
    }>(
      `SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'draft')::text AS draft,
        COUNT(*) FILTER (WHERE status = 'active')::text AS active,
        COUNT(*) FILTER (WHERE status = 'expired')::text AS expired,
        COUNT(*) FILTER (WHERE status = 'terminated')::text AS terminated,
        COUNT(*) FILTER (WHERE status = 'cancelled')::text AS cancelled,
        COUNT(*) FILTER (
          WHERE status = 'active'
            AND end_date IS NOT NULL
            AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        )::text AS expiring_within_30
       FROM contracts
       WHERE NOT is_deleted ${clientFilter}`,
      params,
    );

    const row = rows[0];
    return {
      total: parseInt(row?.total ?? '0', 10),
      draft: parseInt(row?.draft ?? '0', 10),
      active: parseInt(row?.active ?? '0', 10),
      expired: parseInt(row?.expired ?? '0', 10),
      terminated: parseInt(row?.terminated ?? '0', 10),
      cancelled: parseInt(row?.cancelled ?? '0', 10),
      expiringWithin30Days: parseInt(row?.expiring_within_30 ?? '0', 10),
    };
  }

  async findById(id: string): Promise<ContractDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ${LIST_SELECT},
              ct.pf_pct, ct.esic_pct, ct.lwf_pct, ct.penalty_rules,
              ct.invoice_terms, ct.contract_document_url, ct.notes,
              bc.id AS linked_billing_configuration_id
       FROM contracts ct
       INNER JOIN clients c ON c.id = ct.client_id AND NOT c.is_deleted
       LEFT JOIN sites s ON s.id = ct.site_id AND NOT s.is_deleted
       LEFT JOIN billing_configurations bc ON bc.contract_id = ct.id AND NOT bc.is_deleted
       WHERE ct.id = $1 AND NOT ct.is_deleted`,
      [id],
    );
    if (!rows[0]) return null;

    const base = mapListRow(rows[0]);
    const documents = await this.findDocuments(id);

    return {
      ...base,
      pfPct: rows[0].pf_pct != null ? Number(rows[0].pf_pct) : null,
      esicPct: rows[0].esic_pct != null ? Number(rows[0].esic_pct) : null,
      lwfPct: rows[0].lwf_pct != null ? Number(rows[0].lwf_pct) : null,
      penaltyRules: parsePenaltyRules(rows[0].penalty_rules),
      invoiceTerms: rows[0].invoice_terms ? String(rows[0].invoice_terms) : null,
      contractDocumentUrl: rows[0].contract_document_url ? String(rows[0].contract_document_url) : null,
      notes: rows[0].notes ? String(rows[0].notes) : null,
      documents,
      linkedBillingConfigurationId: rows[0].linked_billing_configuration_id
        ? String(rows[0].linked_billing_configuration_id)
        : null,
    };
  }

  async findDocuments(contractId: string) {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, file_name, mime_type, file_size, created_at, created_by
       FROM documents
       WHERE entity_type = 'contract'
         AND entity_id = $1::uuid
         AND NOT is_deleted
       ORDER BY created_at DESC`,
      [contractId],
    );

    return rows.map((r) => ({
      id: String(r.id),
      fileName: String(r.file_name),
      mimeType: r.mime_type ? String(r.mime_type) : null,
      fileSize: r.file_size != null ? Number(r.file_size) : null,
      downloadUrl: `/api/documents/${String(r.id)}/download`,
      createdAt: new Date(String(r.created_at)).toISOString(),
      createdBy: String(r.created_by),
    }));
  }

  async findActiveForSite(clientId: string, siteId: string, excludeId?: string): Promise<string | null> {
    const params: unknown[] = [clientId, siteId];
    let exclude = '';
    if (excludeId) {
      exclude = 'AND ct.id <> $3';
      params.push(excludeId);
    }

    const { rows } = await query<{ id: string }>(
      `SELECT ct.id
       FROM contracts ct
       WHERE ct.client_id = $1
         AND ct.site_id = $2
         AND ct.status = 'active'
         AND ct.start_date <= CURRENT_DATE
         AND (ct.end_date IS NULL OR ct.end_date >= CURRENT_DATE)
         AND NOT ct.is_deleted
         ${exclude}
       LIMIT 1`,
      params,
    );
    return rows[0]?.id ?? null;
  }

  async create(input: CreateContractInput, contractCode: string): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO contracts (
        client_id, site_id, contract_code, contract_name, start_date, end_date,
        billing_type, billing_rate, pf_pct, esic_pct, service_charge_pct, lwf_pct,
        gst_pct, penalty_rules, invoice_frequency, invoice_prefix, invoice_terms,
        contract_document_url, status, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING id`,
      [
        input.clientId,
        input.siteId ?? null,
        contractCode,
        input.contractName,
        input.startDate,
        input.endDate ?? null,
        input.billingType ?? 'monthly',
        input.billingRate ?? null,
        input.pfPct ?? null,
        input.esicPct ?? null,
        input.serviceChargePct ?? 0,
        input.lwfPct ?? null,
        input.gstPct ?? 18,
        JSON.stringify(input.penaltyRules ?? []),
        input.invoiceFrequency ?? 'monthly',
        input.invoicePrefix ?? null,
        input.invoiceTerms ?? null,
        input.contractDocumentUrl ?? null,
        input.status ?? 'draft',
        input.notes ?? null,
        input.createdBy,
      ],
    );
    return rows[0].id;
  }

  async update(input: UpdateContractInput): Promise<void> {
    await query(
      `UPDATE contracts SET
        client_id = $2,
        site_id = $3,
        contract_name = $4,
        start_date = $5,
        end_date = $6,
        billing_type = $7,
        billing_rate = $8,
        pf_pct = $9,
        esic_pct = $10,
        service_charge_pct = $11,
        lwf_pct = $12,
        gst_pct = $13,
        penalty_rules = $14,
        invoice_frequency = $15,
        invoice_prefix = $16,
        invoice_terms = $17,
        contract_document_url = $18,
        status = $19,
        notes = $20,
        updated_at = NOW(),
        updated_by = $21
      WHERE id = $1 AND NOT is_deleted`,
      [
        input.id,
        input.clientId,
        input.siteId ?? null,
        input.contractName,
        input.startDate,
        input.endDate ?? null,
        input.billingType ?? 'monthly',
        input.billingRate ?? null,
        input.pfPct ?? null,
        input.esicPct ?? null,
        input.serviceChargePct ?? 0,
        input.lwfPct ?? null,
        input.gstPct ?? 18,
        JSON.stringify(input.penaltyRules ?? []),
        input.invoiceFrequency ?? 'monthly',
        input.invoicePrefix ?? null,
        input.invoiceTerms ?? null,
        input.contractDocumentUrl ?? null,
        input.status ?? 'draft',
        input.notes ?? null,
        input.updatedBy,
      ],
    );
  }

  async updateStatus(id: string, status: string, updatedBy: string): Promise<void> {
    await query(
      `UPDATE contracts
       SET status = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND NOT is_deleted`,
      [id, status, updatedBy],
    );
  }

  async terminateOverlappingActive(
    clientId: string,
    siteId: string | null,
    excludeId: string,
    updatedBy: string,
  ): Promise<void> {
    if (siteId) {
      await query(
        `UPDATE contracts
         SET status = 'terminated', updated_at = NOW(), updated_by = $4
         WHERE client_id = $1
           AND site_id = $2
           AND status = 'active'
           AND id <> $3
           AND NOT is_deleted`,
        [clientId, siteId, excludeId, updatedBy],
      );
      return;
    }

    await query(
      `UPDATE contracts
       SET status = 'terminated', updated_at = NOW(), updated_by = $3
       WHERE client_id = $1
         AND site_id IS NULL
         AND status = 'active'
         AND id <> $2
         AND NOT is_deleted`,
      [clientId, excludeId, updatedBy],
    );
  }

  async syncBillingConfiguration(contractId: string, siteId: string, updatedBy: string): Promise<string | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE billing_configurations bc
       SET
         contract_id = ct.id,
         billing_type = ct.billing_type,
         billing_rate = COALESCE(ct.billing_rate, bc.billing_rate),
         pf_pct = COALESCE(ct.pf_pct, bc.pf_pct),
         esic_pct = COALESCE(ct.esic_pct, bc.esic_pct),
         lwf_pct = COALESCE(ct.lwf_pct, bc.lwf_pct),
         service_charge_pct = ct.service_charge_pct,
         gst_pct = ct.gst_pct,
         invoice_prefix = COALESCE(ct.invoice_prefix, bc.invoice_prefix),
         billing_cycle = ct.invoice_frequency,
         invoice_notes = COALESCE(ct.invoice_terms, bc.invoice_notes),
         updated_at = NOW(),
         updated_by = $3
       FROM contracts ct
       WHERE bc.site_id = $2
         AND ct.id = $1
         AND NOT bc.is_deleted
         AND NOT ct.is_deleted
       RETURNING bc.id`,
      [contractId, siteId, updatedBy],
    );
    return rows[0]?.id ?? null;
  }

  async softDelete(id: string, deletedBy: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE contracts
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }
}

export const contractRepository = new ContractRepository();
