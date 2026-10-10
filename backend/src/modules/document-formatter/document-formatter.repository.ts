import { query } from '../../database/pool';
import { NotFoundError } from '../../common/errors';
import { EmployeeLifecycleStatus } from '../employee/employee.constants';
import { FormatterEmployee } from './document-formatter.types';

interface EmployeeRow {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  father_name: string | null;
  soft_code: string | null;
}

export class DocumentFormatterRepository {
  async getClientName(clientId: string): Promise<string> {
    const { rows } = await query<{ company_name: string }>(
      `SELECT company_name FROM clients WHERE id = $1::uuid AND NOT is_deleted`,
      [clientId],
    );
    if (!rows[0]) throw new NotFoundError('Client', clientId);
    return rows[0].company_name;
  }

  async listClientEmployees(clientId: string): Promise<FormatterEmployee[]> {
    const { rows } = await query<EmployeeRow>(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name,
              epd.father_name,
              COALESCE(eed.client_soft_code, e.client_soft_code) AS soft_code
       FROM employees e
       INNER JOIN sites s ON s.id = e.site_id AND NOT s.is_deleted
       LEFT JOIN employee_personal_details epd ON epd.employee_id = e.id
       LEFT JOIN employee_employment_details eed ON eed.employee_id = e.id AND eed.is_current = TRUE
       WHERE s.client_id = $1::uuid
         AND NOT e.is_deleted
         AND e.status IN ($2, $3)
       ORDER BY e.employee_code`,
      [clientId, EmployeeLifecycleStatus.Active, EmployeeLifecycleStatus.Rejoined],
    );

    return rows.map((row) => ({
      id: String(row.id),
      employeeCode: String(row.employee_code),
      fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      fatherName: row.father_name?.trim() || null,
      softCode: row.soft_code?.trim() || null,
    }));
  }
}

export const documentFormatterRepository = new DocumentFormatterRepository();
