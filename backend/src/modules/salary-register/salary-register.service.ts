import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { writeAuditLog } from '../iam/audit.service';
import {
  buildConfigSnapshot,
  calculateMonthDays,
  calculateSalaryRow,
  DEFAULT_SALARY_STATUTORY_CONFIG,
  getOtAmountFromAttendance,
  normalizeSalaryStatutoryConfig,
  SalaryStatutoryConfig,
} from './salary-register.calculation';
import {
  InsertSalaryEmployeeRow,
  salaryRegisterRepository,
  SourceEmployeeForSalary,
} from './salary-register.repository';
import {
  GenerateSalaryRegisterInput,
  SalaryRegisterDetail,
  SalaryRegisterFilter,
  SalaryRegisterListItem,
  SalaryRowValidationStatus,
  UpdateSalaryEmployeeInput,
} from './salary-register.types';
import { CursorPaginatedResult } from '../../types';

function validateSourceEmployee(src: SourceEmployeeForSalary): {
  status: SalaryRowValidationStatus;
  messages: string[];
} {
  const messages: string[] = [];

  if (src.presentDays == null) {
    messages.push('Attendance pay days (present days) missing');
  }
  if (!src.attendanceExtrasId) {
    messages.push('No attendance extras row for this employee/period');
  }
  if (src.basicSalary <= 0) {
    messages.push('Basic salary missing or zero');
  }
  if (src.hra < 0) {
    messages.push('HRA invalid');
  }
  if (!src.accountNumber) {
    messages.push('Bank account number missing');
  }
  if (src.pfEligible && !src.uanNumber) {
    messages.push('UAN missing while PF eligible');
  }
  if (src.esiEligible && !src.esiNumber) {
    messages.push('ESI number missing while ESI eligible');
  }
  // OT amount of 0 is allowed (explicit). Missing attendance row already flagged.
  // Do not invent OT from hours.

  const hasError = messages.some(
    (m) =>
      m.includes('pay days') ||
      m.includes('attendance extras') ||
      m.includes('Basic salary'),
  );
  if (hasError) return { status: 'error', messages };
  if (messages.length) return { status: 'warning', messages };
  return { status: 'ok', messages: [] };
}

function buildRowFromSource(
  registerId: string,
  src: SourceEmployeeForSalary,
  monthDays: number,
  config: SalaryStatutoryConfig,
  overrides?: {
    payDays?: number;
    nAll?: number;
    attAwAfd?: number;
  },
): InsertSalaryEmployeeRow {
  const validation = validateSourceEmployee(src);
  const payDays = overrides?.payDays ?? src.presentDays ?? 0;
  const otAmount = getOtAmountFromAttendance(src.otAmount);
  const nAll = overrides?.nAll ?? src.nightAllowance;
  const attAwAfd = overrides?.attAwAfd ?? src.punctualityAward;

  const calc = calculateSalaryRow({
    monthDays,
    payDays,
    basic: src.basicSalary,
    hra: src.hra,
    otAmount,
    nAll,
    attAwAfd,
    bonus: src.bonus,
    pfEligible: src.pfEligible,
    esiEligible: src.esiEligible,
    lwfEligible: src.lwfEligible,
    config,
  });

  return {
    salaryRegisterId: registerId,
    employeeId: src.employeeId,
    sourceAttendanceExtrasId: src.attendanceExtrasId,
    softCode: src.softCode,
    employeeCode: src.employeeCode,
    employeeName: `${src.firstName} ${src.lastName}`.trim(),
    fatherName: src.fatherName,
    designation: src.designation,
    aadhaarNumber: src.aadhaarNumber,
    accountNumber: src.accountNumber,
    uanNumber: src.uanNumber,
    esiNumber: src.esiNumber,
    monthDays: calc.monthDays,
    payDays: calc.payDays,
    otHours: null, // Attendance stores OT as amount in overtime_hours; hours not tracked separately
    basicSalary: calc.basic,
    hra: calc.hra,
    fixedTotal: calc.fixedTotal,
    earningBasic: calc.earningBasic,
    earningHra: calc.earningHra,
    otAmount: calc.otAmount,
    nAll: calc.nAll,
    grossEarnings: calc.grossEarnings,
    attAwAfd: calc.attAwAfd,
    grossTotal: calc.grossTotal,
    esic: calc.esic,
    epf: calc.epf,
    lwf: calc.lwf,
    totalDeduction: calc.totalDeduction,
    netPay: calc.netPay,
    otBasis: null,
    pfEligible: src.pfEligible,
    esiEligible: src.esiEligible,
    lwfEligible: src.lwfEligible,
    validationStatus: validation.status,
    validationMessages: validation.messages,
    calculationVersion: 1,
    rowStatus: overrides ? 'adjusted' : 'calculated',
  };
}

function sumTotals(rows: InsertSalaryEmployeeRow[]) {
  return {
    totalEmployees: rows.length,
    totalGrossEarnings: rows.reduce((s, r) => s + r.grossEarnings, 0),
    totalAttAwAfd: rows.reduce((s, r) => s + r.attAwAfd, 0),
    totalGross: rows.reduce((s, r) => s + r.grossTotal, 0),
    totalEsic: rows.reduce((s, r) => s + r.esic, 0),
    totalEpf: rows.reduce((s, r) => s + r.epf, 0),
    totalLwf: rows.reduce((s, r) => s + r.lwf, 0),
    totalDeductions: rows.reduce((s, r) => s + r.totalDeduction, 0),
    totalNetPay: rows.reduce((s, r) => s + r.netPay, 0),
  };
}

export class SalaryRegisterService {
  async list(filter: SalaryRegisterFilter): Promise<CursorPaginatedResult<SalaryRegisterListItem>> {
    return salaryRegisterRepository.list(filter);
  }

  async getById(id: string): Promise<SalaryRegisterDetail> {
    const detail = await salaryRegisterRepository.findById(id);
    if (!detail) throw new NotFoundError('Salary register', id);
    return detail;
  }

  async generate(input: GenerateSalaryRegisterInput): Promise<SalaryRegisterDetail> {
    const client = await salaryRegisterRepository.findClient(input.clientId);
    if (!client) throw new NotFoundError('Client', input.clientId);

    const finalizedId = await salaryRegisterRepository.findFinalizedForPeriod(
      input.clientId,
      input.month,
      input.year,
    );
    if (finalizedId) {
      throw new ConflictError(
        `A finalized salary register already exists for this client and month (${finalizedId}). Reopen it before regenerating.`,
      );
    }

    const existingOpen = await salaryRegisterRepository.findOpenDraftForPeriod(
      input.clientId,
      input.month,
      input.year,
    );
    if (existingOpen) {
      // Idempotent: refresh the open register instead of failing with a unique conflict.
      return this.recalculate(existingOpen, input.createdBy);
    }

    const attendance = await salaryRegisterRepository.findAttendanceRegister(
      input.clientId,
      input.month,
      input.year,
    );
    if (!attendance) {
      throw new ValidationError(
        { attendance: ['Attendance register not found for this client and month'] },
        'Attendance register required before generating salary',
      );
    }

    const sources = await salaryRegisterRepository.loadSourceEmployees(
      input.clientId,
      input.month,
      input.year,
    );
    if (!sources.length) {
      throw new ValidationError(
        { employees: ['No active employees found for this client'] },
        'No employees to include in salary register',
      );
    }

    const monthDays = calculateMonthDays(input.year, input.month);
    const first = sources[0];
    const config = buildConfigSnapshot({
      employeePfPercentage: first.employeePfPercentage,
      employeeEsiPercentage: first.employeeEsiPercentage,
      employeeLwfPercentage: first.employeeLwfPercentage,
      employeePfMaxAmount: first.employeePfMaxAmount,
      employeeEsiMaxAmount: first.employeeEsiMaxAmount,
      employeeLwfMaxAmount: first.employeeLwfMaxAmount,
      defaults: DEFAULT_SALARY_STATUTORY_CONFIG,
    });

    const runNumber = await salaryRegisterRepository.nextRunNumber(
      input.clientId,
      input.month,
      input.year,
    );

    const registerId = await salaryRegisterRepository.withTransaction(async (tx) => {
      const id = await salaryRegisterRepository.insertRegister(
        {
          clientId: input.clientId,
          month: input.month,
          year: input.year,
          runNumber,
          attendanceRegisterId: attendance.id,
          monthDays,
          configSnapshot: config,
          status: 'calculated',
          createdBy: input.createdBy,
        },
        tx,
      );

      const rows = sources.map((src) => {
        // Per-employee statutory rates for calculation; header snapshot keeps defaults used for audit.
        const empConfig = buildConfigSnapshot({
          employeePfPercentage: src.employeePfPercentage,
          employeeEsiPercentage: src.employeeEsiPercentage,
          employeeLwfPercentage: src.employeeLwfPercentage,
          employeePfMaxAmount: src.employeePfMaxAmount,
          employeeEsiMaxAmount: src.employeeEsiMaxAmount,
          employeeLwfMaxAmount: src.employeeLwfMaxAmount,
          defaults: config,
        });
        return buildRowFromSource(id, src, monthDays, empConfig);
      });

      await salaryRegisterRepository.insertEmployeeRows(rows, tx);
      const totals = sumTotals(rows);
      await salaryRegisterRepository.updateRegisterTotals(
        id,
        { ...totals, status: 'calculated', updatedBy: input.createdBy },
        tx,
      );
      await salaryRegisterRepository.writeAudit(
        {
          salaryRegisterId: id,
          action: 'generated',
          newValues: {
            clientId: input.clientId,
            month: input.month,
            year: input.year,
            employeeCount: rows.length,
            config,
          },
          performedBy: input.createdBy,
        },
        tx,
      );
      return id;
    });

    await writeAuditLog({
      module: 'Payroll',
      action: 'salary_register_generate',
      entityType: 'salary_register',
      entityId: registerId,
      newValues: { clientId: input.clientId, month: input.month, year: input.year },
      createdBy: input.createdBy,
    }).catch(() => undefined);

    return this.getById(registerId);
  }

  async recalculate(id: string, user: string): Promise<SalaryRegisterDetail> {
    const header = await salaryRegisterRepository.getHeaderStatus(id);
    if (!header) throw new NotFoundError('Salary register', id);
    if (header.status === 'finalized') {
      throw new ConflictError('Cannot recalculate a finalized salary register. Reopen it first.');
    }

    const existing = await this.getById(id);
    const sources = await salaryRegisterRepository.loadSourceEmployees(
      header.clientId,
      header.month,
      header.year,
    );
    const monthDays = calculateMonthDays(header.year, header.month);
    const priorByEmployee = new Map(existing.employees.map((e) => [e.employeeId, e]));

    await salaryRegisterRepository.withTransaction(async (tx) => {
      await salaryRegisterRepository.deleteEmployeeRows(id, tx);
      const rows = sources.map((src) => {
        const prior = priorByEmployee.get(src.employeeId);
        const empConfig = buildConfigSnapshot({
          employeePfPercentage: src.employeePfPercentage,
          employeeEsiPercentage: src.employeeEsiPercentage,
          employeeLwfPercentage: src.employeeLwfPercentage,
          employeePfMaxAmount: src.employeePfMaxAmount,
          employeeEsiMaxAmount: src.employeeEsiMaxAmount,
          employeeLwfMaxAmount: src.employeeLwfMaxAmount,
          defaults: header.configSnapshot,
        });
        return buildRowFromSource(id, src, monthDays, empConfig, prior
          ? {
              payDays: prior.payDays,
              nAll: prior.nAll,
              attAwAfd: prior.attAwAfd,
            }
          : undefined);
      });
      await salaryRegisterRepository.insertEmployeeRows(rows, tx);
      const totals = sumTotals(rows);
      await salaryRegisterRepository.updateRegisterTotals(
        id,
        { ...totals, status: 'calculated', updatedBy: user },
        tx,
      );
      await salaryRegisterRepository.writeAudit(
        {
          salaryRegisterId: id,
          action: 'recalculated',
          newValues: { employeeCount: rows.length },
          performedBy: user,
        },
        tx,
      );
    });

    return this.getById(id);
  }

  async updateEmployeeRow(
    registerId: string,
    employeeRowId: string,
    input: UpdateSalaryEmployeeInput,
    user: string,
  ): Promise<SalaryRegisterDetail> {
    const header = await salaryRegisterRepository.getHeaderStatus(registerId);
    if (!header) throw new NotFoundError('Salary register', registerId);
    if (header.status === 'finalized') {
      throw new ConflictError('Finalized salary register is locked. Reopen to edit.');
    }

    const row = await salaryRegisterRepository.getEmployeeRow(registerId, employeeRowId);
    if (!row) throw new NotFoundError('Salary register employee row', employeeRowId);

    const payDays = input.payDays ?? row.payDays;
    const nAll = input.nAll ?? row.nAll;
    const attAwAfd = input.attAwAfd ?? row.attAwAfd;
    const bonus = await salaryRegisterRepository.getAttendanceBonus(row.sourceAttendanceExtrasId);
    const config = normalizeSalaryStatutoryConfig(header.configSnapshot);

    const calc = calculateSalaryRow({
      monthDays: row.monthDays,
      payDays,
      basic: row.basicSalary,
      hra: row.hra,
      otAmount: row.otAmount, // never recalculate from hours
      nAll,
      attAwAfd,
      bonus,
      pfEligible: row.pfEligible,
      esiEligible: row.esiEligible,
      lwfEligible: row.lwfEligible,
      config,
    });

    const updated: InsertSalaryEmployeeRow = {
      salaryRegisterId: registerId,
      employeeId: row.employeeId,
      sourceAttendanceExtrasId: row.sourceAttendanceExtrasId,
      softCode: row.softCode,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      fatherName: row.fatherName,
      designation: row.designation,
      aadhaarNumber: row.aadhaarNumber,
      accountNumber: row.accountNumber,
      uanNumber: row.uanNumber,
      esiNumber: row.esiNumber,
      monthDays: calc.monthDays,
      payDays: calc.payDays,
      otHours: row.otHours,
      basicSalary: calc.basic,
      hra: calc.hra,
      fixedTotal: calc.fixedTotal,
      earningBasic: calc.earningBasic,
      earningHra: calc.earningHra,
      otAmount: calc.otAmount,
      nAll: calc.nAll,
      grossEarnings: calc.grossEarnings,
      attAwAfd: calc.attAwAfd,
      grossTotal: calc.grossTotal,
      esic: calc.esic,
      epf: calc.epf,
      lwf: calc.lwf,
      totalDeduction: calc.totalDeduction,
      netPay: calc.netPay,
      otBasis: row.otBasis,
      pfEligible: row.pfEligible,
      esiEligible: row.esiEligible,
      lwfEligible: row.lwfEligible,
      validationStatus: row.validationStatus,
      validationMessages: row.validationMessages,
      calculationVersion: row.calculationVersion + 1,
      rowStatus: 'adjusted',
    };

    await salaryRegisterRepository.withTransaction(async (tx) => {
      await salaryRegisterRepository.updateEmployeeCalculatedRow(employeeRowId, updated, tx);

      const { rows: sumRows } = await tx.query<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS total_employees,
                COALESCE(SUM(gross_earnings),0) AS total_gross_earnings,
                COALESCE(SUM(att_aw_afd),0) AS total_att_aw_afd,
                COALESCE(SUM(gross_total),0) AS total_gross,
                COALESCE(SUM(esic),0) AS total_esic,
                COALESCE(SUM(epf),0) AS total_epf,
                COALESCE(SUM(lwf),0) AS total_lwf,
                COALESCE(SUM(total_deduction),0) AS total_deductions,
                COALESCE(SUM(net_pay),0) AS total_net_pay
         FROM salary_register_employees WHERE salary_register_id = $1::uuid`,
        [registerId],
      );
      const s = sumRows[0] ?? {};
      await salaryRegisterRepository.updateRegisterTotals(
        registerId,
        {
          totalEmployees: Number(s.total_employees ?? 0),
          totalGrossEarnings: Number(s.total_gross_earnings ?? 0),
          totalAttAwAfd: Number(s.total_att_aw_afd ?? 0),
          totalGross: Number(s.total_gross ?? 0),
          totalEsic: Number(s.total_esic ?? 0),
          totalEpf: Number(s.total_epf ?? 0),
          totalLwf: Number(s.total_lwf ?? 0),
          totalDeductions: Number(s.total_deductions ?? 0),
          totalNetPay: Number(s.total_net_pay ?? 0),
          status: 'reviewed',
          updatedBy: user,
        },
        tx,
      );
      await salaryRegisterRepository.writeAudit(
        {
          salaryRegisterId: registerId,
          employeeRowId,
          action: 'manual_adjustment',
          oldValues: {
            payDays: row.payDays,
            nAll: row.nAll,
            attAwAfd: row.attAwAfd,
            netPay: row.netPay,
          },
          newValues: {
            payDays: updated.payDays,
            nAll: updated.nAll,
            attAwAfd: updated.attAwAfd,
            netPay: updated.netPay,
          },
          performedBy: user,
        },
        tx,
      );
    });

    return this.getById(registerId);
  }

  async finalize(id: string, user: string): Promise<SalaryRegisterDetail> {
    const header = await salaryRegisterRepository.getHeaderStatus(id);
    if (!header) throw new NotFoundError('Salary register', id);
    if (header.status === 'finalized') {
      throw new ConflictError('Salary register is already finalized.');
    }

    const otherFinalized = await salaryRegisterRepository.findFinalizedForPeriod(
      header.clientId,
      header.month,
      header.year,
    );
    if (otherFinalized && otherFinalized !== id) {
      throw new ConflictError('Another finalized salary register exists for this client and month.');
    }

    await salaryRegisterRepository.setStatus(id, 'finalized', user, { finalize: true });
    await salaryRegisterRepository.writeAudit({
      salaryRegisterId: id,
      action: 'finalized',
      performedBy: user,
    });
    await writeAuditLog({
      module: 'Payroll',
      action: 'salary_register_finalize',
      entityType: 'salary_register',
      entityId: id,
      createdBy: user,
    }).catch(() => undefined);

    return this.getById(id);
  }

  async reopen(id: string, user: string, reason?: string): Promise<SalaryRegisterDetail> {
    const header = await salaryRegisterRepository.getHeaderStatus(id);
    if (!header) throw new NotFoundError('Salary register', id);
    if (header.status !== 'finalized') {
      throw new ConflictError('Only finalized salary registers can be reopened.');
    }

    await salaryRegisterRepository.setStatus(id, 'reopened', user, { reopen: true });
    await salaryRegisterRepository.writeAudit({
      salaryRegisterId: id,
      action: 'reopened',
      reason: reason ?? null,
      performedBy: user,
    });
    await writeAuditLog({
      module: 'Payroll',
      action: 'salary_register_reopen',
      entityType: 'salary_register',
      entityId: id,
      newValues: { reason },
      createdBy: user,
    }).catch(() => undefined);

    return this.getById(id);
  }

  async exportExcel(id: string): Promise<Buffer> {
    return salaryRegisterRepository.exportExcel(id);
  }

  async exportPdf(id: string): Promise<Buffer> {
    return salaryRegisterRepository.exportPdf(id);
  }
}

export const salaryRegisterService = new SalaryRegisterService();
