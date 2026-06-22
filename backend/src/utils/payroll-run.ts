import { query } from '../database/pool';
import { PayrollStatus } from '../types/enums';

export function payrollRunCode(year: number, month: number): string {
  return `PR-${year}${String(month).padStart(2, '0')}`;
}

/**
 * Returns an existing payroll run id for the period, restoring soft-deleted drafts when needed.
 * Inserts a new run only when no row exists for the month/year.
 */
export async function resolvePayrollRunId(
  month: number,
  year: number,
  createdBy: string,
): Promise<{ id: string; status: number }> {
  const runCode = payrollRunCode(year, month);

  const { rows } = await query<{ id: string; status: number; is_deleted: boolean }>(
    `SELECT id, status, is_deleted
     FROM payroll_runs
     WHERE month = $1 AND year = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [month, year],
  );

  const existing = rows[0];
  if (existing) {
    if (existing.is_deleted) {
      await query(
        `UPDATE payroll_runs SET
           is_deleted = FALSE,
           deleted_at = NULL,
           deleted_by = NULL,
           run_code = $2,
           status = $3,
           updated_at = NOW(),
           updated_by = $4
         WHERE id = $1`,
        [existing.id, runCode, PayrollStatus.Draft, createdBy],
      );
      return { id: existing.id, status: PayrollStatus.Draft };
    }
    return { id: existing.id, status: existing.status };
  }

  const { rows: inserted } = await query<{ id: string }>(
    `INSERT INTO payroll_runs (run_code, month, year, status, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [runCode, month, year, PayrollStatus.Draft, createdBy],
  );
  return { id: inserted[0].id, status: PayrollStatus.Draft };
}
