import { query } from '../../database/pool';
import { createPaginatedResult, PaginatedResult } from '../../types';
import {
  GeneratePayslipsInput,
  PayslipFilter,
  PayslipListItem,
  PayslipPrintData,
} from './payslip.types';
import { monthName, toNumber, formatDate, daysInMonth } from '../../utils/formatters';
import { NotFoundError } from '../../common/errors';
import { companyRepository } from '../company/company.repository';
import { CompanyProfile } from '../company/company.types';
import { toApiPayslipStatus, normalizePayslipStatus } from './payslip.constants';
import { buildPayslipBreakdownFromPayrollRow, resolvePayslipAttendanceSummary } from './payslip.breakdown';
import {
  ATTENDANCE_REGISTER_EXTRAS_SELECT,
  attendanceRegisterExtrasJoin,
} from './attendance-register.extras';
import {
  EMPLOYEE_PAY_GRADE_JOINS,
  EMPLOYEE_PAY_GRADE_SELECT,
} from '../designation-grade/designation-grade.resolver';

export class PayslipRepository {
  async generateForPeriod(input: GeneratePayslipsInput): Promise<number> {
    const conditions = ['pe.month = $1', 'pe.year = $2', 'NOT pe.is_deleted', 'NOT e.is_deleted'];
    const params: unknown[] = [input.month, input.year];
    let i = 3;

    if (input.employeeIds?.length) {
      conditions.push(`pe.employee_id = ANY($${i++}::uuid[])`);
      params.push(input.employeeIds);
    }
    if (input.clientId) {
      conditions.push(`s.client_id = $${i++}::uuid`);
      params.push(input.clientId);
    }
    if (input.departmentId) {
      conditions.push(`COALESCE(ed.department_id, e.department_id) = $${i++}::uuid`);
      params.push(input.departmentId);
    }

    const where = conditions.join(' AND ');
    const { rows: entries } = await query<Record<string, unknown>>(
      `SELECT pe.*, e.employee_code, pr.id AS run_id,
              ${EMPLOYEE_PAY_GRADE_SELECT},
              ${ATTENDANCE_REGISTER_EXTRAS_SELECT},
              esd.is_pf_applicable AS esd_is_pf_applicable,
              esd.is_esi_applicable AS esd_is_esi_applicable,
              esd.employee_pf_percentage AS esd_employee_pf_percentage,
              esd.employee_esi_percentage AS esd_employee_esi_percentage
       FROM payroll_entries pe
       INNER JOIN employees e ON e.id = pe.employee_id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       ${EMPLOYEE_PAY_GRADE_JOINS}
       ${attendanceRegisterExtrasJoin('pe.employee_id', 'pe.month', 'pe.year')}
       LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id AND NOT esd.is_deleted
       LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
       INNER JOIN payroll_runs pr ON pr.id = pe.payroll_run_id
       WHERE ${where}`,
      params,
    );

    if (entries.length === 0) {
      throw new NotFoundError('Payroll entries for period');
    }

    let generated = 0;
    for (const entry of entries) {
      const breakdown = buildPayslipBreakdownFromPayrollRow(entry);

      const attendanceSummary = resolvePayslipAttendanceSummary({
        ...entry,
        month: entry.month,
        year: entry.year,
      });

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
          status = 'generated', is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL,
          updated_at = NOW(), updated_by = EXCLUDED.created_by`,
        [
          slipNumber,
          entry.id,
          entry.payroll_run_id,
          entry.employee_id,
          input.month,
          input.year,
          breakdown.grossEarnings,
          breakdown.totalDeductions,
          breakdown.netSalary,
          JSON.stringify(breakdown.earnings),
          JSON.stringify(breakdown.deductions),
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
    if (filter.clientId) {
      conditions.push(`s.client_id = $${i++}::uuid`);
      params.push(filter.clientId);
    }
    if (filter.departmentId) {
      conditions.push(`d.id = $${i++}::uuid`);
      params.push(filter.departmentId);
    }
    if (filter.search) {
      conditions.push(`(
        LOWER(e.first_name) LIKE $${i} OR
        LOWER(e.last_name) LIKE $${i} OR
        LOWER(e.employee_code) LIKE $${i}
      )`);
      params.push(`%${filter.search.toLowerCase()}%`);
      i++;
    }
    if (filter.status) {
      conditions.push(`LOWER(ss.status) = $${i++}`);
      params.push(normalizePayslipStatus(filter.status));
    }

    const where = conditions.join(' AND ');
    const count = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM salary_slips ss
       INNER JOIN employees e ON e.id = ss.employee_id
       INNER JOIN departments d ON d.id = e.department_id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
       WHERE ${where}`,
      params,
    );

    const { rows } = await query<Record<string, unknown>>(
      `SELECT ss.*, e.employee_code, e.first_name, e.last_name, d.name AS department_name, des.name AS designation_name
       FROM salary_slips ss
       INNER JOIN employees e ON e.id = ss.employee_id
       INNER JOIN departments d ON d.id = e.department_id
       INNER JOIN designations des ON des.id = e.designation_id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       LEFT JOIN sites s ON s.id = COALESCE(ed.site_id, e.site_id)
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
              d.name AS department_name, des.name AS designation_name, s.site_name,
              pe.basic_salary AS earned_basic_salary,
              pe.house_rent_allowance AS earned_house_rent_allowance,
              pe.special_allowance AS earned_special_allowance,
              pe.present_days, pe.leave_days, pe.absent_days,
              ss.month AS payroll_month,
              ss.year AS payroll_year,
              ${ATTENDANCE_REGISTER_EXTRAS_SELECT},
              ${EMPLOYEE_PAY_GRADE_SELECT},
              esd.is_pf_applicable AS esd_is_pf_applicable,
              esd.is_esi_applicable AS esd_is_esi_applicable,
              esd.employee_pf_percentage AS esd_employee_pf_percentage,
              esd.employee_esi_percentage AS esd_employee_esi_percentage
       FROM salary_slips ss
       INNER JOIN employees e ON e.id = ss.employee_id
       INNER JOIN departments d ON d.id = e.department_id
       INNER JOIN designations des ON des.id = e.designation_id
       LEFT JOIN sites s ON s.id = e.site_id
       LEFT JOIN employee_statutory_details esd ON esd.employee_id = e.id AND NOT esd.is_deleted
       LEFT JOIN payroll_entries pe ON pe.id = ss.payroll_entry_id
       LEFT JOIN employee_employment_details ed ON ed.employee_id = e.id AND ed.is_current = TRUE
       ${EMPLOYEE_PAY_GRADE_JOINS}
       ${attendanceRegisterExtrasJoin('ss.employee_id', 'ss.month', 'ss.year')}
       WHERE ss.id = $1 AND NOT ss.is_deleted`,
      [id],
    );

    const r = rows[0];
    if (!r) return null;
    const companyProfile = await companyRepository.getProfile();
    const printData = this.mapPrintData(r, companyProfile);

    if (r.payroll_entry_id || r.employee_id) {
      const breakdown = buildPayslipBreakdownFromPayrollRow({
        ...r,
        month: r.month ?? r.payroll_month,
        year: r.year ?? r.payroll_year,
      });
      const attendanceSummary = resolvePayslipAttendanceSummary({
        ...r,
        month: r.month ?? r.payroll_month,
        year: r.year ?? r.payroll_year,
      });
      printData.earnings = breakdown.earnings;
      printData.deductions = breakdown.deductions;
      printData.totals = {
        grossEarnings: breakdown.grossEarnings,
        totalDeductions: breakdown.totalDeductions,
        netSalary: breakdown.netSalary,
      };
      printData.attendance = attendanceSummary;
    }

    return printData;
  }

  async findPrintById(id: string): Promise<PayslipPrintData | null> {
    return this.findById(id);
  }

  async getStatus(id: string): Promise<string | null> {
    const { rows } = await query<{ status: string }>(
      `SELECT status FROM salary_slips WHERE id = $1 AND NOT is_deleted`,
      [id],
    );
    return rows[0]?.status ?? null;
  }

  async softDelete(id: string, deletedBy: string): Promise<void> {
    const { rowCount } = await query(
      `UPDATE salary_slips
       SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND NOT is_deleted`,
      [id, deletedBy],
    );
    if (!rowCount) throw new NotFoundError('Salary slip', id);
  }

  async updateStatus(id: string, status: string, updatedBy: string): Promise<void> {
    const { rowCount } = await query(
      `UPDATE salary_slips SET status = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND NOT is_deleted`,
      [id, normalizePayslipStatus(status), updatedBy],
    );
    if (!rowCount) throw new NotFoundError('Salary slip', id);
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
      status: toApiPayslipStatus(String(r.status ?? 'generated')),
      generatedAt: new Date(String(r.generated_at)).toISOString(),
      filePath: r.file_path ? String(r.file_path) : null,
    };
  }

  private mapPrintData(r: Record<string, unknown>, companyProfile: CompanyProfile | null): PayslipPrintData {
    const month = Number(r.month);
    const year = Number(r.year);
    const lastDay = new Date(year, month, 0).getDate();
    const attendance = r.attendance_summary as Record<string, number>;

    return {
      id: String(r.id),
      slipNumber: String(r.slip_number),
      status: toApiPayslipStatus(String(r.status ?? 'generated')),
      generatedAt: new Date(String(r.generated_at)).toISOString(),
      payPeriod: {
        month,
        year,
        monthName: monthName(month, year),
        fromDate: `${year}-${String(month).padStart(2, '0')}-01`,
        toDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      },
      company: this.mapCompany(companyProfile),
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
        workingDays: daysInMonth(month, year),
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

  private mapCompany(profile: CompanyProfile | null): PayslipPrintData['company'] {
    if (!profile) {
      return {
        name: '',
        legalName: null,
        address: '',
        gstNumber: null,
        panNumber: null,
        registrationNumber: null,
        email: null,
        phone: null,
        website: null,
      };
    }

    const cityLine = [profile.city, profile.state, profile.pinCode].filter(Boolean).join(', ');
    const address = [profile.address, cityLine].filter(Boolean).join(', ');

    return {
      name: profile.companyName,
      legalName: profile.legalName ?? null,
      address,
      gstNumber: profile.gstNumber ?? null,
      panNumber: profile.panNumber ?? null,
      registrationNumber: profile.registrationNumber ?? null,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      website: profile.website ?? null,
    };
  }
}

export const payslipRepository = new PayslipRepository();
