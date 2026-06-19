import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import {
  GeneratePayslipsInput,
  PayslipFilter,
  PayslipListItem,
  PayslipPrintData,
} from './payslip.types';
import { monthName, round2, toNumber, formatDate } from '../../utils/formatters';
import { NotFoundError } from '../../common/errors';

const COMPANY_NAME = 'Signet Workforce ERP';
const COMPANY_ADDRESS = 'Signet House, Business Park, India';

export class PayslipRepository {
  async generateForPeriod(input: GeneratePayslipsInput): Promise<number> {
    const { rows: entries } = await query<Record<string, unknown>>(
      `SELECT pe.*, e.employee_code, pr.id AS run_id
       FROM payroll_entries pe
       INNER JOIN employees e ON e.id = pe.employee_id
       INNER JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
       WHERE pe.month = $1 AND pe.year = $2 AND NOT pe.is_deleted AND NOT e.is_deleted`,
      [input.month, input.year],
    );

    if (entries.length === 0) {
      throw new NotFoundError('Payroll entries for period');
    }

    let generated = 0;
    for (const entry of entries) {
      const basic = toNumber(entry.basic_salary as string);
      const hra = toNumber(entry.house_rent_allowance as string);
      const special = toNumber(entry.special_allowance as string);
      const pf = toNumber(entry.provident_fund as string);
      const esi = toNumber(entry.esi as string);
      const pt = toNumber(entry.professional_tax as string);
      const gross = round2(basic + hra + special);
      const deductions = round2(pf + esi + pt);
      const net = round2(gross - deductions);

      const earnings = [
        { code: 'BASIC', label: 'Basic Salary', amount: basic },
        { code: 'HRA', label: 'House Rent Allowance', amount: hra },
        { code: 'SA', label: 'Special Allowance', amount: special },
      ].filter((e) => e.amount > 0);

      const deductionItems = [
        { code: 'PF', label: 'Provident Fund', amount: pf },
        { code: 'ESI', label: 'ESIC', amount: esi },
        { code: 'PT', label: 'Professional Tax', amount: pt },
      ].filter((d) => d.amount > 0);

      const attendanceSummary = {
        workingDays: Number(entry.working_days),
        presentDays: Number(entry.present_days),
        leaveDays: Number(entry.leave_days),
        absentDays: Number(entry.absent_days),
      };

      const slipNumber = `PS-${input.year}${String(input.month).padStart(2, '0')}-${entry.employee_code}`;

      await query(
        `INSERT INTO salary_slips (
          slip_number, payroll_entry_id, payroll_run_id, employee_id, month, year,
          gross_earnings, total_deductions, net_salary, earnings, deductions,
          attendance_summary, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (employee_id, month, year) DO UPDATE SET
          slip_number = EXCLUDED.slip_number, payroll_entry_id = EXCLUDED.payroll_entry_id,
          payroll_run_id = EXCLUDED.payroll_run_id, gross_earnings = EXCLUDED.gross_earnings,
          total_deductions = EXCLUDED.total_deductions, net_salary = EXCLUDED.net_salary,
          earnings = EXCLUDED.earnings, deductions = EXCLUDED.deductions,
          attendance_summary = EXCLUDED.attendance_summary, generated_at = NOW(),
          updated_at = NOW(), updated_by = EXCLUDED.created_by`,
        [
          slipNumber,
          entry.id,
          entry.payroll_run_id,
          entry.employee_id,
          input.month,
          input.year,
          gross,
          deductions,
          net,
          JSON.stringify(earnings),
          JSON.stringify(deductionItems),
          JSON.stringify(attendanceSummary),
          input.createdBy,
        ],
      );
      generated++;
    }

    return generated;
  }

  async findAll(filter: PayslipFilter): Promise<PaginatedResult<PayslipListItem>> {
    const conditions = ['NOT ss.is_deleted'];
    const params: unknown[] = [];
    let i = 1;

    if (filter.month) {
      conditions.push(`ss.month = $${i++}`);
      params.push(filter.month);
    }
    if (filter.year) {
      conditions.push(`ss.year = $${i++}`);
      params.push(filter.year);
    }
    if (filter.employeeId) {
      conditions.push(`ss.employee_id = $${i++}::uuid`);
      params.push(filter.employeeId);
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM salary_slips ss WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ss.*, e.employee_code, e.first_name, e.last_name, d.name AS department_name, des.name AS designation_name
       FROM salary_slips ss
       INNER JOIN employees e ON e.id = ss.employee_id
       INNER JOIN departments d ON d.id = e.department_id
       INNER JOIN designations des ON des.id = e.designation_id
       WHERE ${where}
       ORDER BY ss.year DESC, ss.month DESC, e.employee_code
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
    );

    const items = rows.map((r) => this.mapListItem(r));
    return createPaginatedResult(items, parseInt(count.rows[0].count, 10), filter.page, filter.pageSize);
  }

  async findById(id: string): Promise<PayslipPrintData | null> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT ss.*, e.employee_code, e.first_name, e.last_name, e.joining_date,
              e.bank_name, e.account_number, e.ifsc_code, e.pan_number,
              COALESCE(esd.uan_number, e.uan_number) AS uan_number,
              COALESCE(esd.pf_number, e.pf_number) AS pf_number,
              COALESCE(esd.esi_number, e.esi_number) AS esi_number,
              d.name AS department_name, des.name AS designation_name, s.site_name
       FROM salary_slips ss
       INNER JOIN employees e ON e.id = ss.employee_id
       INNER JOIN departments d ON d.id = e.department_id
       INNER JOIN designations des ON des.id = e.designation_id
       LEFT JOIN sites s ON s.id = e.site_id
       LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id AND NOT esd.is_deleted
       WHERE ss.id = $1 AND NOT ss.is_deleted`,
      [id],
    );

    const r = rows[0];
    if (!r) return null;
    return this.mapPrintData(r);
  }

  async findPrintById(id: string): Promise<PayslipPrintData | null> {
    return this.findById(id);
  }

  private mapListItem(r: Record<string, unknown>): PayslipListItem {
    const month = Number(r.month);
    const year = Number(r.year);
    return {
      id: String(r.id),
      slipNumber: String(r.slip_number),
      employeeId: String(r.employee_id),
      employeeCode: String(r.employee_code),
      employeeName: `${r.first_name} ${r.last_name}`,
      department: String(r.department_name),
      designation: String(r.designation_name),
      month,
      year,
      monthName: monthName(month, year),
      grossEarnings: toNumber(r.gross_earnings as string),
      totalDeductions: toNumber(r.total_deductions as string),
      netSalary: toNumber(r.net_salary as string),
      generatedAt: new Date(String(r.generated_at)).toISOString(),
      filePath: r.file_path ? String(r.file_path) : null,
    };
  }

  private mapPrintData(r: Record<string, unknown>): PayslipPrintData {
    const month = Number(r.month);
    const year = Number(r.year);
    const lastDay = new Date(year, month, 0).getDate();
    const attendance = r.attendance_summary as Record<string, number>;

    return {
      slipNumber: String(r.slip_number),
      generatedAt: new Date(String(r.generated_at)).toISOString(),
      payPeriod: {
        month,
        year,
        monthName: monthName(month, year),
        fromDate: `${year}-${String(month).padStart(2, '0')}-01`,
        toDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      },
      company: {
        name: COMPANY_NAME,
        address: COMPANY_ADDRESS,
      },
      employee: {
        id: String(r.employee_id),
        code: String(r.employee_code),
        name: `${r.first_name} ${r.last_name}`,
        department: String(r.department_name),
        designation: String(r.designation_name),
        siteName: r.site_name ? String(r.site_name) : null,
        joiningDate: formatDate(String(r.joining_date))!,
        bankName: r.bank_name ? String(r.bank_name) : null,
        accountNumber: r.account_number ? String(r.account_number) : null,
        ifscCode: r.ifsc_code ? String(r.ifsc_code) : null,
        panNumber: r.pan_number ? String(r.pan_number) : null,
        uanNumber: r.uan_number ? String(r.uan_number) : null,
        pfNumber: r.pf_number ? String(r.pf_number) : null,
        esiNumber: r.esi_number ? String(r.esi_number) : null,
      },
      attendance: {
        workingDays: attendance.workingDays ?? 0,
        presentDays: attendance.presentDays ?? 0,
        leaveDays: attendance.leaveDays ?? 0,
        absentDays: attendance.absentDays ?? 0,
      },
      earnings: r.earnings as PayslipPrintData['earnings'],
      deductions: r.deductions as PayslipPrintData['deductions'],
      totals: {
        grossEarnings: toNumber(r.gross_earnings as string),
        totalDeductions: toNumber(r.total_deductions as string),
        netSalary: toNumber(r.net_salary as string),
      },
    };
  }
}

export const payslipRepository = new PayslipRepository();
