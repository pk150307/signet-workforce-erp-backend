import { query } from '../../database/pool';
import { AppError, NotFoundError } from '../../common/errors';
import { EmployeeLifecycleStatus } from '../employee/employee.constants';
import {
  AttendanceCellUpdate,
  AttendanceEmployeeListItem,
  AttendanceGridEmployee,
  AttendanceGridResponse,
  AttendanceRegisterMeta,
  BulkMarkInput,
  EmployeeAttendanceCalendar,
  ImportPreviewResult,
  ImportPreviewEmployeeRow,
  RegisterFilter,
  RegisterStatus,
  UnlockLogEntry,
} from './attendance.types';
import {
  countByStatus,
  employeeRowStatus,
  isSunday,
  monthDateRange,
  statusLabel,
} from './attendance.utils';
import {
  buildHorizontalWorkbook,
  HorizontalExportEmployee,
  parseHorizontalCsv,
  parseHorizontalWorkbook,
} from './attendance.excel';

interface ClientEmployeeRow {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department_name: string;
  site_name: string;
  site_id: string;
}

interface RegisterExtras {
  overtimeHours: number;
  nightAllowance: number;
  punctualityAward: number;
}

const EMPTY_REGISTER_EXTRAS: RegisterExtras = {
  overtimeHours: 0,
  nightAllowance: 0,
  punctualityAward: 0,
};

export class AttendanceRepository {
  async getClientEmployees(clientId: string): Promise<ClientEmployeeRow[]> {
    const { rows } = await query<ClientEmployeeRow>(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name,
              d.name AS department_name, s.site_name, s.id AS site_id
       FROM employees e
       INNER JOIN sites s ON s.id = e.site_id AND NOT s.is_deleted
       INNER JOIN departments d ON d.id = e.department_id
       WHERE s.client_id = $1::uuid
         AND NOT e.is_deleted
         AND e.status IN ($2, $3)
       ORDER BY e.employee_code`,
      [clientId, EmployeeLifecycleStatus.Active, EmployeeLifecycleStatus.Rejoined],
    );
    return rows;
  }

  async getClientName(clientId: string): Promise<string> {
    const { rows } = await query<{ company_name: string }>(
      `SELECT company_name FROM clients WHERE id = $1::uuid AND NOT is_deleted`,
      [clientId],
    );
    if (!rows[0]) throw new NotFoundError('Client', clientId);
    return rows[0].company_name;
  }

  async ensureRegister(clientId: string, month: number, year: number, user: string) {
    const existing = await query<Record<string, unknown>>(
      `SELECT * FROM attendance_registers WHERE client_id = $1::uuid AND month = $2 AND year = $3`,
      [clientId, month, year],
    );
    if (existing.rows[0]) return existing.rows[0];

    const { rows } = await query<Record<string, unknown>>(
      `INSERT INTO attendance_registers (client_id, month, year, status, created_by)
       VALUES ($1::uuid, $2, $3, 'draft', $4) RETURNING *`,
      [clientId, month, year, user],
    );
    return rows[0];
  }

  async getRegisterRow(clientId: string, month: number, year: number) {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT r.*, c.company_name
       FROM attendance_registers r
       INNER JOIN clients c ON c.id = r.client_id
       WHERE r.client_id = $1::uuid AND r.month = $2 AND r.year = $3`,
      [clientId, month, year],
    );
    return rows[0] ?? null;
  }

  async loadRegisterExtrasMap(registerId: string, employeeIds: string[]): Promise<Map<string, RegisterExtras>> {
    const map = new Map<string, RegisterExtras>();
    if (!registerId || !employeeIds.length) return map;

    const { rows } = await query<{
      employee_id: string;
      overtime_hours: string;
      night_allowance: string;
      punctuality_award: string;
    }>(
      `SELECT employee_id, overtime_hours, night_allowance, punctuality_award
       FROM attendance_register_employee_overtime
       WHERE register_id = $1::uuid AND employee_id = ANY($2::uuid[])`,
      [registerId, employeeIds],
    );
    for (const row of rows) {
      map.set(row.employee_id, {
        overtimeHours: parseFloat(row.overtime_hours) || 0,
        nightAllowance: parseFloat(row.night_allowance) || 0,
        punctualityAward: parseFloat(row.punctuality_award) || 0,
      });
    }
    return map;
  }

  async upsertEmployeeRegisterExtras(
    registerId: string,
    employeeId: string,
    extras: RegisterExtras,
    user: string,
  ): Promise<void> {
    await query(
      `INSERT INTO attendance_register_employee_overtime (
        register_id, employee_id, overtime_hours, night_allowance, punctuality_award, created_by
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
      ON CONFLICT (register_id, employee_id) DO UPDATE SET
        overtime_hours = EXCLUDED.overtime_hours,
        night_allowance = EXCLUDED.night_allowance,
        punctuality_award = EXCLUDED.punctuality_award,
        updated_at = NOW(),
        updated_by = EXCLUDED.created_by`,
      [
        registerId,
        employeeId,
        extras.overtimeHours,
        extras.nightAllowance,
        extras.punctualityAward,
        user,
      ],
    );
  }

  async loadAttendanceMap(
    employeeIds: string[],
    fromDate: string,
    toDate: string,
  ): Promise<Map<string, Record<string, number | null>>> {
    const map = new Map<string, Record<string, number | null>>();
    if (!employeeIds.length) return map;

    const { rows } = await query<{ employee_id: string; attendance_date: string; status: number }>(
      `SELECT employee_id, attendance_date::text, status
       FROM attendances
       WHERE employee_id = ANY($1::uuid[])
         AND attendance_date BETWEEN $2 AND $3
         AND NOT is_deleted`,
      [employeeIds, fromDate, toDate],
    );

    for (const row of rows) {
      const empId = String(row.employee_id);
      if (!map.has(empId)) map.set(empId, {});
      map.get(empId)![String(row.attendance_date).slice(0, 10)] = Number(row.status);
    }
    return map;
  }

  buildRegisterMeta(
    register: Record<string, unknown> | null,
    clientId: string,
    clientName: string,
    month: number,
    year: number,
    employeeCount: number,
    dates: string[],
    attendanceMap: Map<string, Record<string, number | null>>,
    employeeIds: string[],
  ): AttendanceRegisterMeta {
    const totalDays = dates.length;
    const totalCells = employeeCount * totalDays;
    let markedCells = 0;

    for (const empId of employeeIds) {
      const cells = attendanceMap.get(empId) ?? {};
      for (const date of dates) {
        if (cells[date] != null) markedCells++;
      }
    }

    return {
      id: register ? String(register.id) : '',
      clientId,
      clientName,
      month,
      year,
      status: ((register?.status as RegisterStatus) ?? 'draft'),
      lockedAt: register?.locked_at ? String(register.locked_at) : null,
      lockedBy: register?.locked_by ? String(register.locked_by) : null,
      submittedAt: register?.submitted_at ? String(register.submitted_at) : null,
      submittedBy: register?.submitted_by ? String(register.submitted_by) : null,
      totalEmployees: employeeCount,
      totalDays,
      markedCells,
      unmarkedCells: totalCells - markedCells,
      isComplete: totalCells > 0 && markedCells === totalCells,
    };
  }

  async getEmployeeList(filter: RegisterFilter): Promise<{
    register: AttendanceRegisterMeta;
    items: AttendanceEmployeeListItem[];
  }> {
    const clientName = await this.getClientName(filter.clientId);
    const employees = await this.getClientEmployees(filter.clientId);
    const register = await this.getRegisterRow(filter.clientId, filter.month, filter.year);
    const { dates, days, from, to } = monthDateRange(filter.year, filter.month);
    const attendanceMap = await this.loadAttendanceMap(
      employees.map((e) => e.id),
      from,
      to,
    );

    const registerMeta = this.buildRegisterMeta(
      register,
      filter.clientId,
      clientName,
      filter.month,
      filter.year,
      employees.length,
      dates,
      attendanceMap,
      employees.map((e) => e.id),
    );

    const registerId = register ? String(register.id) : '';
    const extrasMap = await this.loadRegisterExtrasMap(registerId, employees.map((e) => e.id));

    const locked = registerMeta.status === 'locked';
    const items = employees.map((emp) => {
      const cells: Record<string, number | null> = {};
      for (const date of dates) {
        cells[date] = attendanceMap.get(emp.id)?.[date] ?? null;
      }
      const counts = countByStatus(cells, dates);
      const extras = extrasMap.get(emp.id) ?? EMPTY_REGISTER_EXTRAS;
      return {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
        departmentName: emp.department_name,
        siteName: emp.site_name,
        presentCount: counts.present,
        absentCount: counts.absent,
        leaveCount: counts.leave,
        halfDayCount: counts.halfDay,
        holidayCount: counts.holiday,
        weekOffCount: counts.weekOff,
        unmarkedCount: counts.unmarked,
        overtimeHours: extras.overtimeHours,
        nightAllowance: extras.nightAllowance,
        punctualityAward: extras.punctualityAward,
        rowStatus: employeeRowStatus(counts, days.length, locked),
      };
    });

    return { register: registerMeta, items };
  }

  async getGrid(filter: RegisterFilter, user: string): Promise<AttendanceGridResponse> {
    await this.ensureRegister(filter.clientId, filter.month, filter.year, user);
    const { register, items } = await this.getEmployeeList(filter);
    const { dates, days, from, to } = monthDateRange(filter.year, filter.month);
    const attendanceMap = await this.loadAttendanceMap(
      items.map((i) => i.employeeId),
      from,
      to,
    );

    const employees: AttendanceGridEmployee[] = items.map((item) => {
      const cells: Record<string, number | null> = {};
      for (const date of dates) {
        cells[date] = attendanceMap.get(item.employeeId)?.[date] ?? null;
      }
      return {
        employeeId: item.employeeId,
        employeeCode: item.employeeCode,
        employeeName: item.employeeName,
        departmentName: item.departmentName,
        siteName: item.siteName,
        cells,
        overtimeHours: item.overtimeHours,
        nightAllowance: item.nightAllowance,
        punctualityAward: item.punctualityAward,
      };
    });

    return { register, days, dates, employees };
  }

  async assertEditable(clientId: string, month: number, year: number) {
    const register = await this.getRegisterRow(clientId, month, year);
    if (register && String(register.status) === 'locked') {
      throw new AppError(409, 'This attendance register is locked. Unlock it before making changes.');
    }
  }

  async upsertCell(update: AttendanceCellUpdate, siteId: string | null, user: string): Promise<void> {
    if (update.status == null) {
      await query(
        `UPDATE attendances SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $3, updated_at = NOW()
         WHERE employee_id = $1::uuid AND attendance_date = $2::date AND NOT is_deleted`,
        [update.employeeId, update.date, user],
      );
      return;
    }

    await query(
      `INSERT INTO attendances (
        employee_id, site_id, attendance_date, status, is_manual_entry, created_by
      ) VALUES ($1::uuid, $2::uuid, $3::date, $4, TRUE, $5)
      ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
        status = EXCLUDED.status,
        site_id = COALESCE(EXCLUDED.site_id, attendances.site_id),
        is_manual_entry = TRUE,
        is_deleted = FALSE,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = NOW(),
        updated_by = EXCLUDED.created_by`,
      [update.employeeId, siteId, update.date, update.status, user],
    );
  }

  async updateCells(
    clientId: string,
    month: number,
    year: number,
    updates: AttendanceCellUpdate[],
    user: string,
  ): Promise<void> {
    await this.assertEditable(clientId, month, year);
    await this.ensureRegister(clientId, month, year, user);

    const employees = await this.getClientEmployees(clientId);
    const siteByEmployee = new Map(employees.map((e) => [e.id, e.site_id]));

    for (const update of updates) {
      if (!siteByEmployee.has(update.employeeId)) {
        throw new AppError(400, `Employee ${update.employeeId} is not assigned to this client.`);
      }
      await this.upsertCell(update, siteByEmployee.get(update.employeeId) ?? null, user);
    }
  }

  async submitEmployeeRow(
    clientId: string,
    month: number,
    year: number,
    employeeId: string,
    cells: Array<{ date: string; status: number | null }>,
    user: string,
    extras: RegisterExtras = EMPTY_REGISTER_EXTRAS,
  ): Promise<{ employee: AttendanceGridEmployee; register: AttendanceRegisterMeta }> {
    const updates: AttendanceCellUpdate[] = cells.map((cell) => ({
      employeeId,
      date: cell.date,
      status: cell.status,
    }));
    await this.updateCells(clientId, month, year, updates, user);

    const register = await this.ensureRegister(clientId, month, year, user);
    await this.upsertEmployeeRegisterExtras(String(register.id), employeeId, extras, user);

    const grid = await this.getGrid({ clientId, month, year }, user);
    const employee = grid.employees.find((e) => e.employeeId === employeeId);
    if (!employee) {
      throw new AppError(404, 'Employee not found in this client register.');
    }
    return { employee, register: grid.register };
  }

  async bulkMark(input: BulkMarkInput, user: string): Promise<number> {
    await this.assertEditable(input.clientId, input.month, input.year);
    await this.ensureRegister(input.clientId, input.month, input.year, user);

    const employees = await this.getClientEmployees(input.clientId);
    const { dates } = monthDateRange(input.year, input.month);
    const updates: AttendanceCellUpdate[] = [];

    if (input.action === 'mark_sundays') {
      const status = input.status ?? 6;
      for (const date of dates) {
        const day = parseInt(date.slice(8, 10), 10);
        if (!isSunday(input.year, input.month, day)) continue;
        for (const emp of employees) {
          updates.push({ employeeId: emp.id, date, status });
        }
      }
    } else if (input.action === 'mark_all_present') {
      const status = input.status ?? 1;
      for (const emp of employees) {
        for (const date of dates) {
          updates.push({ employeeId: emp.id, date, status });
        }
      }
    } else if (input.action === 'clear_unmarked') {
      const { from, to } = monthDateRange(input.year, input.month);
      const map = await this.loadAttendanceMap(employees.map((e) => e.id), from, to);
      for (const emp of employees) {
        for (const date of dates) {
          if (map.get(emp.id)?.[date] == null) continue;
          updates.push({ employeeId: emp.id, date, status: null });
        }
      }
    }

    for (const update of updates) {
      const siteId = employees.find((e) => e.id === update.employeeId)?.site_id ?? null;
      await this.upsertCell(update, siteId, user);
    }
    return updates.length;
  }

  async parseImportBuffer(
    buffer: Buffer,
    filename: string,
    month: number,
    year: number,
  ) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
      return parseHorizontalWorkbook(buffer, month, year);
    }
    if (lower.endsWith('.csv')) {
      return parseHorizontalCsv(buffer.toString('utf8'), month, year);
    }
    throw new AppError(400, 'Unsupported file format. Upload .xlsx or .csv in horizontal register format.');
  }

  async previewImportBuffer(
    clientId: string,
    month: number,
    year: number,
    buffer: Buffer,
    filename: string,
  ): Promise<ImportPreviewResult> {
    const employees = await this.getClientEmployees(clientId);
    const codeMap = new Map(employees.map((e) => [e.employee_code.toLowerCase(), e]));
    const parsed = await this.parseImportBuffer(buffer, filename, month, year);
    const { dates } = monthDateRange(year, month);

    if (parsed.dateColumns.length === 0) {
      throw new AppError(400, 'No valid date columns found. Use headers like 01-Apr-26 for the selected month.');
    }

    const validRows: ImportPreviewEmployeeRow[] = [];
    const errors: ImportPreviewEmployeeRow[] = [];
    const cellUpdates = new Map<string, Record<string, number | null>>();
    const extrasUpdates = new Map<string, RegisterExtras>();

    for (const emp of employees) {
      cellUpdates.set(emp.id, {});
    }

    for (const row of parsed.rows) {
      const previewRow: ImportPreviewEmployeeRow = {
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        overtimeHours: row.overtimeHours,
        nightAllowance: row.nightAllowance,
        punctualityAward: row.punctualityAward,
        cellsUpdated: Object.keys(row.cells).length,
      };

      const emp = codeMap.get(row.employeeCode.toLowerCase());
      if (!emp) {
        previewRow.error = 'Unknown employee code for this client';
        errors.push(previewRow);
        continue;
      }

      for (const date of dates) {
        if (row.cells[date] !== undefined) {
          cellUpdates.get(emp.id)![date] = row.cells[date];
        }
      }
      extrasUpdates.set(emp.id, {
        overtimeHours: row.overtimeHours,
        nightAllowance: row.nightAllowance,
        punctualityAward: row.punctualityAward,
      });
      validRows.push(previewRow);
    }

    const preview: AttendanceGridEmployee[] = employees.map((emp) => {
      const extras = extrasUpdates.get(emp.id) ?? EMPTY_REGISTER_EXTRAS;
      return {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
        departmentName: emp.department_name,
        siteName: emp.site_name,
        cells: cellUpdates.get(emp.id) ?? {},
        overtimeHours: extras.overtimeHours,
        nightAllowance: extras.nightAllowance,
        punctualityAward: extras.punctualityAward,
      };
    });

    const totalCellsParsed = validRows.reduce((sum, r) => sum + r.cellsUpdated, 0);
    return { validRows, errors, preview, totalCellsParsed };
  }

  async applyImportBuffer(
    clientId: string,
    month: number,
    year: number,
    buffer: Buffer,
    filename: string,
    user: string,
  ): Promise<{ applied: number; skipped: number; grid: AttendanceGridResponse }> {
    const preview = await this.previewImportBuffer(clientId, month, year, buffer, filename);
    const { dates } = monthDateRange(year, month);
    const updates: AttendanceCellUpdate[] = [];
    const importedEmployeeIds = new Set<string>();

    for (const row of preview.validRows) {
      const emp = preview.preview.find((p) => p.employeeCode.toLowerCase() === row.employeeCode.toLowerCase());
      if (!emp) continue;
      importedEmployeeIds.add(emp.employeeId);
      for (const date of dates) {
        if (emp.cells[date] !== undefined) {
          updates.push({ employeeId: emp.employeeId, date, status: emp.cells[date] ?? null });
        }
      }
    }

    await this.updateCells(clientId, month, year, updates, user);

    const register = await this.ensureRegister(clientId, month, year, user);
    for (const emp of preview.preview) {
      if (!importedEmployeeIds.has(emp.employeeId)) continue;
      await this.upsertEmployeeRegisterExtras(
        String(register.id),
        emp.employeeId,
        {
          overtimeHours: emp.overtimeHours,
          nightAllowance: emp.nightAllowance,
          punctualityAward: emp.punctualityAward,
        },
        user,
      );
    }

    const grid = await this.getGrid({ clientId, month, year }, user);
    return { applied: updates.length, skipped: preview.errors.length, grid };
  }

  async buildRegisterWorkbook(
    clientId: string,
    month: number,
    year: number,
    user: string,
    includeData: boolean,
  ): Promise<Buffer> {
    const clientName = await this.getClientName(clientId);
    const employees = await this.getClientEmployees(clientId);
    const { dates } = monthDateRange(year, month);

    let exportEmployees: HorizontalExportEmployee[] = employees.map((emp) => ({
      employeeCode: emp.employee_code,
      employeeName: `${emp.first_name} ${emp.last_name}`.trim(),
      cells: {},
      overtimeHours: 0,
      nightAllowance: 0,
      punctualityAward: 0,
    }));

    if (includeData) {
      await this.ensureRegister(clientId, month, year, user);
      const grid = await this.getGrid({ clientId, month, year }, user);
      exportEmployees = grid.employees.map((emp) => ({
        employeeCode: emp.employeeCode,
        employeeName: emp.employeeName,
        cells: emp.cells,
        overtimeHours: emp.overtimeHours,
        nightAllowance: emp.nightAllowance,
        punctualityAward: emp.punctualityAward,
      }));
    }

    return buildHorizontalWorkbook(clientName, month, year, dates, exportEmployees);
  }

  async lockRegister(clientId: string, month: number, year: number, user: string) {
    await this.ensureRegister(clientId, month, year, user);
    const list = await this.getEmployeeList({ clientId, month, year });
    if (!list.register.isComplete) {
      throw new AppError(400, `Register incomplete: ${list.register.unmarkedCells} cell(s) still unmarked.`);
    }

    await query(
      `UPDATE attendance_registers SET
        status = 'locked', locked_at = NOW(), locked_by = $4,
        submitted_at = NOW(), submitted_by = $4, updated_at = NOW(), updated_by = $4
       WHERE client_id = $1::uuid AND month = $2 AND year = $3`,
      [clientId, month, year, user],
    );
    return this.getEmployeeList({ clientId, month, year });
  }

  async unlockRegister(clientId: string, month: number, year: number, reason: string, user: string) {
    const register = await this.getRegisterRow(clientId, month, year);
    if (!register) throw new NotFoundError('Attendance register', `${clientId}/${month}/${year}`);
    if (String(register.status) !== 'locked') {
      throw new AppError(400, 'Register is not locked.');
    }

    await query(
      `UPDATE attendance_registers SET
        status = 'draft', locked_at = NULL, locked_by = NULL,
        updated_at = NOW(), updated_by = $4
       WHERE client_id = $1::uuid AND month = $2 AND year = $3`,
      [clientId, month, year, user],
    );

    await query(
      `INSERT INTO attendance_register_unlock_logs (register_id, reason, unlocked_by)
       VALUES ($1::uuid, $2, $3)`,
      [register.id, reason, user],
    );

    return this.getEmployeeList({ clientId, month, year });
  }

  async getUnlockHistory(clientId: string, month: number, year: number): Promise<UnlockLogEntry[]> {
    const register = await this.getRegisterRow(clientId, month, year);
    if (!register) return [];

    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, reason, unlocked_by, unlocked_at
       FROM attendance_register_unlock_logs
       WHERE register_id = $1::uuid
       ORDER BY unlocked_at DESC`,
      [register.id],
    );

    return rows.map((r) => ({
      id: String(r.id),
      reason: String(r.reason),
      unlockedBy: String(r.unlocked_by),
      unlockedAt: String(r.unlocked_at),
    }));
  }

  async getEmployeeCalendar(employeeId: string, month: number, year: number): Promise<EmployeeAttendanceCalendar> {
    const { rows } = await query<Record<string, unknown>>(
      `SELECT e.id, e.employee_code, e.first_name, e.last_name,
              s.site_name, c.company_name, s.client_id
       FROM employees e
       LEFT JOIN sites s ON s.id = e.site_id
       LEFT JOIN clients c ON c.id = s.client_id
       WHERE e.id = $1::uuid AND NOT e.is_deleted`,
      [employeeId],
    );
    if (!rows[0]) throw new NotFoundError('Employee', employeeId);

    const clientId = rows[0].client_id ? String(rows[0].client_id) : null;
    const register = clientId ? await this.getRegisterRow(clientId, month, year) : null;
    const { dates, from, to } = monthDateRange(year, month);
    const map = await this.loadAttendanceMap([employeeId], from, to);
    const cells = map.get(employeeId) ?? {};
    const counts = countByStatus(
      Object.fromEntries(dates.map((d) => [d, cells[d] ?? null])),
      dates,
    );

    const registerId = register ? String(register.id) : '';
    const extras = registerId
      ? (await this.loadRegisterExtrasMap(registerId, [employeeId])).get(employeeId) ?? EMPTY_REGISTER_EXTRAS
      : EMPTY_REGISTER_EXTRAS;

    return {
      employeeId,
      employeeCode: String(rows[0].employee_code),
      employeeName: `${rows[0].first_name} ${rows[0].last_name}`.trim(),
      clientName: rows[0].company_name ? String(rows[0].company_name) : '—',
      siteName: rows[0].site_name ? String(rows[0].site_name) : '—',
      month,
      year,
      registerStatus: register ? (String(register.status) as 'draft' | 'locked') : 'draft',
      summary: {
        present: counts.present,
        absent: counts.absent,
        leave: counts.leave,
        halfDay: counts.halfDay,
        holiday: counts.holiday,
        weekOff: counts.weekOff,
        unmarked: counts.unmarked,
        workingDays: dates.length - counts.holiday - counts.weekOff,
        overtimeHours: extras.overtimeHours,
        nightAllowance: extras.nightAllowance,
        punctualityAward: extras.punctualityAward,
      },
      days: dates.map((date) => {
        const day = parseInt(date.slice(8, 10), 10);
        const status = cells[date] ?? null;
        return {
          date,
          day,
          dayOfWeek: new Date(year, month - 1, day).getDay(),
          status,
          statusLabel: statusLabel(status),
        };
      }),
    };
  }

  getImportTemplateCsv(): string {
    return 'Use GET /registers/import/template?clientId=&month=&year= for Excel template download.';
  }
}

export const attendanceRepository = new AttendanceRepository();
