import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { CursorPaginatedResult } from '../../types';
import { roundOff } from '../../utils/formatters';
import {
  computePayable,
  employeeAdvancesRepository,
  InsertAdvanceEntry,
  SourceEmployeeForAdvance,
} from './employee-advances.repository';
import {
  EmployeeAdvanceDetail,
  EmployeeAdvanceFilter,
  EmployeeAdvanceListItem,
  GenerateEmployeeAdvanceInput,
  UpsertAdvancePaymentInput,
} from './employee-advances.types';

function buildEntry(
  registerId: string,
  src: SourceEmployeeForAdvance,
): InsertAdvanceEntry {
  return {
    advanceRegisterId: registerId,
    employeeId: src.employeeId,
    softCode: src.softCode,
    employeeCode: src.employeeCode,
    employeeName: `${src.firstName} ${src.lastName}`.trim(),
    designation: src.designation,
    advanceAmount: 0,
    notes: null,
    salaryNetPay: src.salaryNetPay,
    payableAmount: computePayable(src.salaryNetPay, 0),
  };
}

function assertPaidOnValid(paidOn: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    throw new ValidationError({ paidOn: ['Invalid date'] }, 'paidOn must be YYYY-MM-DD');
  }
}

export class EmployeeAdvancesService {
  async list(filter: EmployeeAdvanceFilter): Promise<CursorPaginatedResult<EmployeeAdvanceListItem>> {
    return employeeAdvancesRepository.list(filter);
  }

  async getById(id: string): Promise<EmployeeAdvanceDetail> {
    const detail = await employeeAdvancesRepository.findById(id);
    if (!detail) throw new NotFoundError('Employee advance register', id);
    return detail;
  }

  async generate(input: GenerateEmployeeAdvanceInput): Promise<EmployeeAdvanceDetail> {
    const client = await employeeAdvancesRepository.findClient(input.clientId);
    if (!client) throw new NotFoundError('Client', input.clientId);

    const finalizedId = await employeeAdvancesRepository.findFinalizedForPeriod(
      input.clientId,
      input.month,
      input.year,
    );
    if (finalizedId) {
      throw new ConflictError(
        'A finalized advance register already exists for this client and period. Reopen it to make changes.',
      );
    }

    const existingOpen = await employeeAdvancesRepository.findOpenForPeriod(
      input.clientId,
      input.month,
      input.year,
    );
    if (existingOpen) {
      return this.refresh(existingOpen, input.createdBy);
    }

    const salaryReg = await employeeAdvancesRepository.findSalaryRegisterForPeriod(
      input.clientId,
      input.month,
      input.year,
    );
    const sources = await employeeAdvancesRepository.loadSourceEmployees(
      input.clientId,
      salaryReg?.id ?? null,
    );
    if (!sources.length) {
      throw new ValidationError(
        { employees: ['No active employees found for this client'] },
        'No employees to include in advance register',
      );
    }

    const runNumber = await employeeAdvancesRepository.nextRunNumber(
      input.clientId,
      input.month,
      input.year,
    );

    const registerId = await employeeAdvancesRepository.withTransaction(async (tx) => {
      const id = await employeeAdvancesRepository.insertRegister(
        {
          clientId: input.clientId,
          month: input.month,
          year: input.year,
          runNumber,
          salaryRegisterId: salaryReg?.id ?? null,
          status: 'open',
          createdBy: input.createdBy,
        },
        tx,
      );
      const rows = sources.map((src) => buildEntry(id, src));
      await employeeAdvancesRepository.insertEntries(rows, tx);
      const totals = {
        totalEmployees: rows.length,
        totalAdvance: 0,
        totalSalaryNetPay: roundOff(rows.reduce((s, r) => s + (r.salaryNetPay ?? 0), 0)),
        totalPayable: roundOff(rows.reduce((s, r) => s + (r.payableAmount ?? 0), 0)),
      };
      await employeeAdvancesRepository.updateRegisterTotals(
        id,
        { ...totals, status: 'open', salaryRegisterId: salaryReg?.id ?? null, updatedBy: input.createdBy },
        tx,
      );
      await employeeAdvancesRepository.writeAudit(
        {
          advanceRegisterId: id,
          action: 'generated',
          newValues: { employeeCount: rows.length, salaryRegisterId: salaryReg?.id ?? null },
          performedBy: input.createdBy,
        },
        tx,
      );
      return id;
    });

    return this.getById(registerId);
  }

  /** Upsert employees + salary snapshots; keeps existing dated payments. */
  async refresh(id: string, user: string): Promise<EmployeeAdvanceDetail> {
    const header = await employeeAdvancesRepository.getHeaderStatus(id);
    if (!header) throw new NotFoundError('Employee advance register', id);
    if (header.status === 'finalized') {
      throw new ConflictError('Cannot refresh a finalized advance register. Reopen it first.');
    }

    const salaryReg = await employeeAdvancesRepository.findSalaryRegisterForPeriod(
      header.clientId,
      header.month,
      header.year,
    );
    const sources = await employeeAdvancesRepository.loadSourceEmployees(
      header.clientId,
      salaryReg?.id ?? null,
    );

    await employeeAdvancesRepository.withTransaction(async (tx) => {
      const existing = await employeeAdvancesRepository.listEntriesByRegister(id, tx);
      const byEmployee = new Map(existing.map((e) => [e.employeeId, e]));

      for (const src of sources) {
        const prior = byEmployee.get(src.employeeId);
        if (prior) {
          await employeeAdvancesRepository.updateEntryIdentity(
            prior.id,
            {
              softCode: src.softCode,
              employeeCode: src.employeeCode,
              employeeName: `${src.firstName} ${src.lastName}`.trim(),
              designation: src.designation,
              salaryNetPay: src.salaryNetPay,
              payableAmount: computePayable(src.salaryNetPay, prior.advanceAmount),
            },
            tx,
          );
        } else {
          await employeeAdvancesRepository.insertEntry(buildEntry(id, src), tx);
        }
      }

      await employeeAdvancesRepository.deleteEntriesNotInEmployees(
        id,
        sources.map((s) => s.employeeId),
        tx,
      );

      const totals = await employeeAdvancesRepository.sumEntryTotals(id, tx);
      await employeeAdvancesRepository.updateRegisterTotals(
        id,
        {
          ...totals,
          status: 'open',
          salaryRegisterId: salaryReg?.id ?? null,
          updatedBy: user,
        },
        tx,
      );
      await employeeAdvancesRepository.writeAudit(
        {
          advanceRegisterId: id,
          action: 'refreshed',
          newValues: { employeeCount: sources.length, salaryRegisterId: salaryReg?.id ?? null },
          performedBy: user,
        },
        tx,
      );
    });

    return this.getById(id);
  }

  async addPayment(
    registerId: string,
    entryId: string,
    input: UpsertAdvancePaymentInput,
    user: string,
  ): Promise<EmployeeAdvanceDetail> {
    await this.requireEditable(registerId);
    assertPaidOnValid(input.paidOn);
    const entry = await employeeAdvancesRepository.getEntry(registerId, entryId);
    if (!entry) throw new NotFoundError('Employee advance entry', entryId);

    await employeeAdvancesRepository.withTransaction(async (tx) => {
      const paymentId = await employeeAdvancesRepository.insertPayment(
        {
          entryId,
          paidOn: input.paidOn,
          amount: input.amount,
          notes: input.notes ?? null,
          createdBy: user,
        },
        tx,
      );
      await employeeAdvancesRepository.recomputeEntryTotals(entryId, tx);
      const totals = await employeeAdvancesRepository.sumEntryTotals(registerId, tx);
      await employeeAdvancesRepository.updateRegisterTotals(
        registerId,
        { ...totals, status: 'open', updatedBy: user },
        tx,
      );
      await employeeAdvancesRepository.writeAudit(
        {
          advanceRegisterId: registerId,
          entryId,
          action: 'payment_added',
          newValues: {
            paymentId,
            paidOn: input.paidOn,
            amount: input.amount,
            notes: input.notes ?? null,
          },
          performedBy: user,
        },
        tx,
      );
    });

    return this.getById(registerId);
  }

  async updatePayment(
    registerId: string,
    entryId: string,
    paymentId: string,
    input: UpsertAdvancePaymentInput,
    user: string,
  ): Promise<EmployeeAdvanceDetail> {
    await this.requireEditable(registerId);
    assertPaidOnValid(input.paidOn);
    const entry = await employeeAdvancesRepository.getEntry(registerId, entryId);
    if (!entry) throw new NotFoundError('Employee advance entry', entryId);
    const existing = await employeeAdvancesRepository.getPayment(paymentId, entryId);
    if (!existing) throw new NotFoundError('Advance payment', paymentId);

    await employeeAdvancesRepository.withTransaction(async (tx) => {
      await employeeAdvancesRepository.updatePayment(
        paymentId,
        entryId,
        {
          paidOn: input.paidOn,
          amount: input.amount,
          notes: input.notes ?? null,
          updatedBy: user,
        },
        tx,
      );
      await employeeAdvancesRepository.recomputeEntryTotals(entryId, tx);
      const totals = await employeeAdvancesRepository.sumEntryTotals(registerId, tx);
      await employeeAdvancesRepository.updateRegisterTotals(
        registerId,
        { ...totals, status: 'open', updatedBy: user },
        tx,
      );
      await employeeAdvancesRepository.writeAudit(
        {
          advanceRegisterId: registerId,
          entryId,
          action: 'payment_updated',
          oldValues: {
            paymentId,
            paidOn: existing.paidOn,
            amount: existing.amount,
            notes: existing.notes,
          },
          newValues: {
            paymentId,
            paidOn: input.paidOn,
            amount: input.amount,
            notes: input.notes ?? null,
          },
          performedBy: user,
        },
        tx,
      );
    });

    return this.getById(registerId);
  }

  async deletePayment(
    registerId: string,
    entryId: string,
    paymentId: string,
    user: string,
  ): Promise<EmployeeAdvanceDetail> {
    await this.requireEditable(registerId);
    const entry = await employeeAdvancesRepository.getEntry(registerId, entryId);
    if (!entry) throw new NotFoundError('Employee advance entry', entryId);
    const existing = await employeeAdvancesRepository.getPayment(paymentId, entryId);
    if (!existing) throw new NotFoundError('Advance payment', paymentId);

    await employeeAdvancesRepository.withTransaction(async (tx) => {
      await employeeAdvancesRepository.deletePayment(paymentId, entryId, tx);
      await employeeAdvancesRepository.recomputeEntryTotals(entryId, tx);
      const totals = await employeeAdvancesRepository.sumEntryTotals(registerId, tx);
      await employeeAdvancesRepository.updateRegisterTotals(
        registerId,
        { ...totals, status: 'open', updatedBy: user },
        tx,
      );
      await employeeAdvancesRepository.writeAudit(
        {
          advanceRegisterId: registerId,
          entryId,
          action: 'payment_deleted',
          oldValues: {
            paymentId,
            paidOn: existing.paidOn,
            amount: existing.amount,
            notes: existing.notes,
          },
          performedBy: user,
        },
        tx,
      );
    });

    return this.getById(registerId);
  }

  async finalize(id: string, user: string): Promise<EmployeeAdvanceDetail> {
    const header = await employeeAdvancesRepository.getHeaderStatus(id);
    if (!header) throw new NotFoundError('Employee advance register', id);
    if (header.status === 'finalized') {
      throw new ConflictError('Advance register is already finalized.');
    }

    const otherFinalized = await employeeAdvancesRepository.findFinalizedForPeriod(
      header.clientId,
      header.month,
      header.year,
    );
    if (otherFinalized && otherFinalized !== id) {
      throw new ConflictError('Another advance register is already finalized for this period.');
    }

    await employeeAdvancesRepository.setStatus(id, 'finalized', user, { finalize: true });
    await employeeAdvancesRepository.writeAudit({
      advanceRegisterId: id,
      action: 'finalized',
      performedBy: user,
    });
    return this.getById(id);
  }

  async reopen(id: string, user: string, reason?: string): Promise<EmployeeAdvanceDetail> {
    const header = await employeeAdvancesRepository.getHeaderStatus(id);
    if (!header) throw new NotFoundError('Employee advance register', id);
    if (header.status !== 'finalized') {
      throw new ConflictError('Only a finalized advance register can be reopened.');
    }
    await employeeAdvancesRepository.setStatus(id, 'reopened', user, { reopen: true });
    await employeeAdvancesRepository.writeAudit({
      advanceRegisterId: id,
      action: 'reopened',
      reason: reason ?? null,
      performedBy: user,
    });
    return this.getById(id);
  }

  async exportExcel(id: string): Promise<Buffer> {
    await this.getById(id);
    return employeeAdvancesRepository.exportExcel(id);
  }

  async exportPdf(id: string): Promise<Buffer> {
    await this.getById(id);
    return employeeAdvancesRepository.exportPdf(id);
  }

  private async requireEditable(registerId: string) {
    const header = await employeeAdvancesRepository.getHeaderStatus(registerId);
    if (!header) throw new NotFoundError('Employee advance register', registerId);
    if (header.status === 'finalized') {
      throw new ConflictError('Finalized advance register is locked. Reopen to edit.');
    }
    return header;
  }
}

export const employeeAdvancesService = new EmployeeAdvancesService();
