import { query } from '../database/pool';
import { buildNextSequentialCode } from './code-sequence';

/** Next client code from all rows (soft-deleted codes still occupy the unique constraint). */
export async function nextClientCode(): Promise<string> {
  const { rows } = await query<{ client_code: string }>('SELECT client_code FROM clients');
  return buildNextSequentialCode(
    rows.map((r) => r.client_code),
    'CLT',
    4,
  );
}

/** Next site code from all rows (soft-deleted codes still occupy the unique constraint). */
export async function nextSiteCode(): Promise<string> {
  const { rows } = await query<{ site_code: string }>('SELECT site_code FROM sites');
  return buildNextSequentialCode(
    rows.map((r) => r.site_code),
    'SITE',
    4,
  );
}

/** Next invoice number for a billing period, e.g. INV-202606-0001. */
export async function nextInvoiceNumber(year: number, month: number): Promise<string> {
  const prefix = `INV-${year}${String(month).padStart(2, '0')}`;
  const { rows } = await query<{ invoice_number: string }>(
    'SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1',
    [`${prefix}-%`],
  );
  return buildNextSequentialCode(
    rows.map((r) => r.invoice_number),
    prefix,
    4,
  );
}

/** Next employee code from all rows matching the code pattern. */
export async function nextEmployeeCode(
  codePrefix: string,
  padLength: number,
  regexPattern: string,
): Promise<string> {
  const { rows } = await query<{ employee_code: string }>(
    'SELECT employee_code FROM employees WHERE employee_code ~ $1',
    [regexPattern],
  );
  return buildNextSequentialCode(
    rows.map((r) => r.employee_code),
    codePrefix,
    padLength,
  );
}
