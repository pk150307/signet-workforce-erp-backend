import { query } from '../../database/pool';
import {
  CursorPaginatedResult,
  parseCursorPaginationQuery,
  runCursorList,
} from '../../types';
import { nextClientCode } from '../../utils/next-code';
import {
  ClientDetail,
  ClientFilter,
  ClientListItem,
  CreateClientInput,
  UpdateClientInput,
} from './client.types';

export class ClientRepository {
  async findAll(filter: ClientFilter): Promise<CursorPaginatedResult<ClientListItem>> {
    const pagination = parseCursorPaginationQuery(filter);
    const conditions = ['NOT c.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.search) {
      conditions.push(`(LOWER(c.company_name) LIKE $${i} OR LOWER(c.client_code) LIKE $${i})`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`c.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    return runCursorList({
      queryFn: query,
      pagination,
      conditions,
      params,
      selectSql: `SELECT c.id, c.client_code, c.company_name, c.contact_person, c.email, c.phone,
              c.city, c.state, c.is_active, c.created_at,
              (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id AND NOT s.is_deleted) AS total_sites
       FROM clients c`,
      sortFields: [
        { column: 'c.company_name', key: 'companyName', direction: 'ASC' },
        { column: 'c.id', key: 'id', direction: 'ASC' },
      ],
      mapRow: (r) => this.mapListItem(r),
    });
  }

  async findById(id: string): Promise<ClientDetail | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT c.*,
              (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id AND NOT s.is_deleted) AS total_sites
       FROM clients c WHERE c.id = $1 AND NOT c.is_deleted`,
      [id],
    );
    if (!rows[0]) return null;
    return this.mapDetail(rows[0]);
  }

  async create(input: CreateClientInput): Promise<{ id: string; clientCode: string }> {
    const clientCode = await nextClientCode();

    const { rows } = await query<{ id: string }>(
      `INSERT INTO clients (
        client_code, company_name, contact_person, email, phone, alternate_phone, website,
        gst_number, pan_number, address, city, state, pin_code, notes, is_active, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id`,
      [
        clientCode,
        input.companyName,
        input.contactPerson?.trim() || '',
        input.email?.trim() || '',
        input.phone?.trim() || '',
        input.alternatePhone ?? null,
        input.website ?? null,
        input.gstNumber ?? null,
        input.panNumber ?? null,
        input.address?.trim() || '',
        input.city?.trim() || '',
        input.state?.trim() || '',
        input.pinCode ?? '',
        input.notes ?? null,
        input.isActive ?? true,
        input.createdBy,
      ],
    );

    return { id: rows[0].id, clientCode };
  }

  async update(input: UpdateClientInput): Promise<void> {
    await query(
      `UPDATE clients SET
        company_name = $2, contact_person = $3, email = $4, phone = $5,
        alternate_phone = $6, website = $7, gst_number = $8, pan_number = $9,
        address = $10, city = $11, state = $12, pin_code = $13, notes = $14,
        is_active = COALESCE($15, is_active),
        updated_at = NOW(), updated_by = $16
       WHERE id = $1 AND NOT is_deleted`,
      [
        input.id,
        input.companyName,
        input.contactPerson?.trim() || '',
        input.email?.trim() || '',
        input.phone?.trim() || '',
        input.alternatePhone ?? null,
        input.website ?? null,
        input.gstNumber ?? null,
        input.panNumber ?? null,
        input.address?.trim() || '',
        input.city?.trim() || '',
        input.state?.trim() || '',
        input.pinCode ?? '',
        input.notes ?? null,
        input.isActive ?? null,
        input.createdBy,
      ],
    );
  }

  async softDelete(id: string, deletedBy: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE clients SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async exists(id: string): Promise<boolean> {
    const { rows } = await query('SELECT 1 FROM clients WHERE id = $1 AND NOT is_deleted', [id]);
    return rows.length > 0;
  }

  private mapListItem(r: Record<string, unknown>): ClientListItem {
    return {
      id: String(r.id),
      clientCode: String(r.client_code),
      companyName: String(r.company_name),
      contactPerson: String(r.contact_person),
      email: String(r.email),
      phone: String(r.phone),
      city: String(r.city ?? ''),
      state: String(r.state ?? ''),
      isActive: Boolean(r.is_active),
      totalSites: parseInt(String(r.total_sites ?? 0), 10),
    };
  }

  private mapDetail(r: Record<string, unknown>): ClientDetail {
    return {
      ...this.mapListItem(r),
      alternatePhone: r.alternate_phone ? String(r.alternate_phone) : null,
      website: r.website ? String(r.website) : null,
      address: String(r.address ?? ''),
      pinCode: String(r.pin_code ?? ''),
      gstNumber: r.gst_number ? String(r.gst_number) : null,
      panNumber: r.pan_number ? String(r.pan_number) : null,
      notes: r.notes ? String(r.notes) : null,
    };
  }
}

export const clientRepository = new ClientRepository();
