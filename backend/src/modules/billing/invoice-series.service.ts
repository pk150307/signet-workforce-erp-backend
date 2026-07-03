import { PoolClient } from 'pg';
import { withTransaction } from '../../database/pool';

export interface FinancialYear {
  start: number;
  end: number;
}

export interface InvoiceSeriesRow {
  id: string;
  prefix: string | null;
  formatTemplate: string;
  financialYearStart: number;
  financialYearEnd: number;
}

export interface AllocatedInvoiceNumber {
  invoiceNumber: string;
  seriesId: string;
  sequence: number;
  fy: FinancialYear;
}

/** India FY (Apr–Mar) for a billing month/year. */
export function resolveFinancialYear(month: number, year: number): FinancialYear {
  if (month >= 4) {
    return { start: year, end: year + 1 };
  }
  return { start: year - 1, end: year };
}

export function formatFyShort(fyStart: number, fyEnd: number): string {
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

export function formatInvoiceNumber(
  template: string,
  sequence: number,
  prefix: string | null,
  fyStart: number,
  fyEnd: number,
): string {
  return template
    .replace(/\{prefix\}/g, prefix ?? '')
    .replace(/\{seq\}/g, String(sequence))
    .replace(/\{fy_short\}/g, formatFyShort(fyStart, fyEnd))
    .replace(/\{fy_start\}/g, String(fyStart))
    .replace(/\{fy_end\}/g, String(fyEnd))
    .replace(/^\//, '')
    .replace(/\/\//g, '/');
}

export class InvoiceSeriesService {
  async resolveSeries(
    client: PoolClient,
    clientId: string,
    siteId: string,
    fy: FinancialYear,
  ): Promise<InvoiceSeriesRow | null> {
    const { rows } = await client.query<{
      id: string;
      prefix: string | null;
      format_template: string;
      financial_year_start: number;
      financial_year_end: number;
    }>(
      `SELECT id, prefix, format_template, financial_year_start, financial_year_end
       FROM invoice_series
       WHERE is_active AND NOT is_deleted
         AND financial_year_start = $3
         AND financial_year_end = $4
         AND (site_id = $2 OR (client_id = $1 AND site_id IS NULL) OR is_default)
       ORDER BY
         CASE WHEN site_id = $2 THEN 0 WHEN client_id = $1 THEN 1 ELSE 2 END,
         created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [clientId, siteId, fy.start, fy.end],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      prefix: row.prefix,
      formatTemplate: row.format_template,
      financialYearStart: row.financial_year_start,
      financialYearEnd: row.financial_year_end,
    };
  }

  async ensureDefaultSeries(client: PoolClient, fy: FinancialYear, createdBy: string): Promise<InvoiceSeriesRow> {
    const { rows: existing } = await client.query<{
      id: string;
      prefix: string | null;
      format_template: string;
      financial_year_start: number;
      financial_year_end: number;
    }>(
      `SELECT id, prefix, format_template, financial_year_start, financial_year_end
       FROM invoice_series
       WHERE is_default AND is_active AND NOT is_deleted
         AND financial_year_start = $1 AND financial_year_end = $2
       LIMIT 1
       FOR UPDATE`,
      [fy.start, fy.end],
    );

    if (existing[0]) {
      const row = existing[0];
      return {
        id: row.id,
        prefix: row.prefix,
        formatTemplate: row.format_template,
        financialYearStart: row.financial_year_start,
        financialYearEnd: row.financial_year_end,
      };
    }

    const { rows } = await client.query<{
      id: string;
      prefix: string | null;
      format_template: string;
      financial_year_start: number;
      financial_year_end: number;
    }>(
      `INSERT INTO invoice_series (
        series_code, prefix, financial_year_start, financial_year_end,
        current_sequence, format_template, is_default, is_active, created_by
      ) VALUES ($1, NULL, $2, $3, 0, '{seq}/{fy_short}', TRUE, TRUE, $4)
      RETURNING id, prefix, format_template, financial_year_start, financial_year_end`,
      [`DEFAULT-${fy.start}-${fy.end}`, fy.start, fy.end, createdBy],
    );

    const row = rows[0];
    return {
      id: row.id,
      prefix: row.prefix,
      formatTemplate: row.format_template,
      financialYearStart: row.financial_year_start,
      financialYearEnd: row.financial_year_end,
    };
  }

  async allocateNumber(
    client: PoolClient,
    input: {
      clientId: string;
      siteId: string;
      month: number;
      year: number;
      configPrefix?: string | null;
      createdBy: string;
    },
  ): Promise<AllocatedInvoiceNumber> {
    const fy = resolveFinancialYear(input.month, input.year);
    let series = await this.resolveSeries(client, input.clientId, input.siteId, fy);
    if (!series) {
      series = await this.ensureDefaultSeries(client, fy, input.createdBy);
    }

    const { rows } = await client.query<{ current_sequence: number }>(
      `UPDATE invoice_series
       SET current_sequence = current_sequence + 1,
           updated_at = NOW(),
           updated_by = $2
       WHERE id = $1
       RETURNING current_sequence`,
      [series.id, input.createdBy],
    );

    const sequence = rows[0]?.current_sequence ?? 1;
    const prefix = input.configPrefix ?? series.prefix;
    const invoiceNumber = formatInvoiceNumber(
      series.formatTemplate,
      sequence,
      prefix,
      series.financialYearStart,
      series.financialYearEnd,
    );

    return { invoiceNumber, seriesId: series.id, sequence, fy };
  }

  async nextInvoiceNumber(input: {
    clientId: string;
    siteId: string;
    month: number;
    year: number;
    configPrefix?: string | null;
    createdBy: string;
  }): Promise<AllocatedInvoiceNumber> {
    return withTransaction((client) => this.allocateNumber(client, input));
  }
}

export const invoiceSeriesService = new InvoiceSeriesService();
