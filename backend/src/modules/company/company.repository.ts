import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import {
  BranchListItem,
  CompanyListFilter,
  CompanyProfile,
  OfficeListItem,
  UpdateCompanyProfileInput,
} from './company.types';
import { getPublicUrl } from '../documents/upload.config';

export class CompanyRepository {
  async getProfile(): Promise<CompanyProfile | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT * FROM company_profiles WHERE NOT is_deleted ORDER BY created_at LIMIT 1`,
    );
    const row = rows[0];
    return row ? this.mapProfile(row) : null;
  }

  async updateProfile(input: UpdateCompanyProfileInput): Promise<CompanyProfile> {
    const existing = await this.getProfile();

    if (existing) {
      const { rows } = await query<Record<string, unknown>>(
        `UPDATE company_profiles SET
          company_name = $2, legal_name = $3, registration_number = $4, gst_number = $5,
          pan_number = $6, email = $7, phone = $8, website = $9, address = $10,
          city = $11, state = $12, pin_code = $13, billing_address = $14,
          billing_city = $15, billing_state = $16, billing_pin_code = $17,
          logo_url = COALESCE($18, logo_url),
          updated_at = NOW(), updated_by = $19
         WHERE id = $1
         RETURNING *`,
        [
          existing.id,
          input.companyName,
          input.legalName,
          input.registrationNumber ?? null,
          input.gstNumber ?? null,
          input.panNumber ?? null,
          input.email,
          input.phone,
          input.website ?? null,
          input.address,
          input.city,
          input.state,
          input.pinCode ?? null,
          input.billingAddress ?? null,
          input.billingCity ?? null,
          input.billingState ?? null,
          input.billingPinCode ?? null,
          input.logoUrl ?? null,
          input.updatedBy,
        ],
      );
      return this.mapProfile(rows[0]);
    }

    const { rows } = await query<Record<string, unknown>>(
      `INSERT INTO company_profiles (
        company_name, legal_name, registration_number, gst_number, pan_number,
        email, phone, website, address, city, state, pin_code,
        billing_address, billing_city, billing_state, billing_pin_code, logo_url, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        input.companyName,
        input.legalName,
        input.registrationNumber ?? null,
        input.gstNumber ?? null,
        input.panNumber ?? null,
        input.email,
        input.phone,
        input.website ?? null,
        input.address,
        input.city,
        input.state,
        input.pinCode ?? null,
        input.billingAddress ?? null,
        input.billingCity ?? null,
        input.billingState ?? null,
        input.billingPinCode ?? null,
        input.logoUrl ?? null,
        input.updatedBy,
      ],
    );
    return this.mapProfile(rows[0]);
  }

  async findBranches(filter: CompanyListFilter): Promise<PaginatedResult<BranchListItem>> {
    const conditions = ['NOT b.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.search) {
      conditions.push(
        `(LOWER(b.branch_code) LIKE $${i} OR LOWER(b.branch_name) LIKE $${i} OR LOWER(COALESCE(b.city, '')) LIKE $${i} OR LOWER(COALESCE(b.state, '')) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`b.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM company_branches b WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT b.id, b.branch_code, b.branch_name, b.city, b.state, b.is_active,
              0 AS head_count
       FROM company_branches b
       WHERE ${where}
       ORDER BY b.branch_name
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    const items = rows.map((r) => ({
      id: String(r.id),
      branchCode: String(r.branch_code),
      branchName: String(r.branch_name),
      city: r.city ? String(r.city) : null,
      state: r.state ? String(r.state) : null,
      headCount: Number(r.head_count ?? 0),
      isActive: Boolean(r.is_active),
    }));

    return createPaginatedResult(items, parseInt(count.rows[0].count, 10), filter.page, filter.pageSize);
  }

  async findOffices(filter: CompanyListFilter): Promise<PaginatedResult<OfficeListItem>> {
    const conditions = ['NOT o.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.search) {
      conditions.push(
        `(LOWER(o.office_code) LIKE $${i} OR LOWER(o.office_name) LIKE $${i} OR LOWER(b.branch_name) LIKE $${i} OR LOWER(COALESCE(o.floor, '')) LIKE $${i})`,
      );
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }

    if (filter.isActive !== undefined) {
      conditions.push(`o.is_active = $${i++}`);
      params.push(filter.isActive);
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM company_offices o
       INNER JOIN company_branches b ON b.id = o.branch_id
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT o.id, o.office_code, o.office_name, o.floor, o.capacity, o.is_active,
              b.branch_name
       FROM company_offices o
       INNER JOIN company_branches b ON b.id = o.branch_id
       WHERE ${where}
       ORDER BY o.office_name
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    const items = rows.map((r) => ({
      id: String(r.id),
      officeCode: String(r.office_code),
      officeName: String(r.office_name),
      branchName: String(r.branch_name),
      floor: r.floor ? String(r.floor) : null,
      capacity: Number(r.capacity ?? 0),
      isActive: Boolean(r.is_active),
    }));

    return createPaginatedResult(items, parseInt(count.rows[0].count, 10), filter.page, filter.pageSize);
  }

  async softDeleteBranch(id: string, deletedBy: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE company_branches SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async softDeleteOffice(id: string, deletedBy: string): Promise<boolean> {
    const { rowCount } = await query(
      `UPDATE company_offices SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
    return (rowCount ?? 0) > 0;
  }

  private mapProfile(r: Record<string, unknown>): CompanyProfile {
    const logoPath = r.logo_url ? String(r.logo_url) : null;
    return {
      id: String(r.id),
      companyName: String(r.company_name),
      legalName: String(r.legal_name),
      registrationNumber: r.registration_number ? String(r.registration_number) : null,
      gstNumber: r.gst_number ? String(r.gst_number) : null,
      panNumber: r.pan_number ? String(r.pan_number) : null,
      email: String(r.email),
      phone: String(r.phone),
      website: r.website ? String(r.website) : null,
      address: String(r.address),
      city: String(r.city),
      state: String(r.state),
      pinCode: r.pin_code ? String(r.pin_code) : null,
      billingAddress: r.billing_address ? String(r.billing_address) : null,
      billingCity: r.billing_city ? String(r.billing_city) : null,
      billingState: r.billing_state ? String(r.billing_state) : null,
      billingPinCode: r.billing_pin_code ? String(r.billing_pin_code) : null,
      logoUrl: logoPath?.startsWith('http') ? logoPath : logoPath ? getPublicUrl(logoPath) : null,
    };
  }
}

export const companyRepository = new CompanyRepository();
