import { payslipRepository } from './payslip.repository';
import {
  BulkPayslipActionInput,
  GeneratePayslipsInput,
  PayslipFilter,
  UpdatePayslipStatusInput,
} from './payslip.types';
import { AppError, NotFoundError } from '../../common/errors';
import { processPayrollForPeriod } from './payroll-processor';
import {
  ALLOWED_PAYSLIP_TRANSITIONS,
  PAYSLIP_DELETABLE_STATUSES,
  PAYSLIP_STATUS_LABELS,
  normalizePayslipStatus,
  toApiPayslipStatus,
} from './payslip.constants';

export class PayslipService {
  async generate(input: GeneratePayslipsInput) {
    await processPayrollForPeriod({
      month: input.month,
      year: input.year,
      employeeIds: input.employeeIds,
      clientId: input.clientId,
      departmentId: input.departmentId,
      createdBy: input.createdBy,
    });

    const count = await payslipRepository.generateForPeriod(input);
    return {
      generated: count,
      count,
      month: input.month,
      year: input.year,
    };
  }

  list(filter: PayslipFilter) {
    return payslipRepository.findAll(filter);
  }

  async getById(id: string) {
    const payslip = await payslipRepository.findById(id);
    if (!payslip) throw new NotFoundError('Salary slip', id);
    return payslip;
  }

  async getPrintData(id: string) {
    const payslip = await payslipRepository.findPrintById(id);
    if (!payslip) throw new NotFoundError('Salary slip', id);
    return payslip;
  }

  async deletePayslip(id: string, deletedBy: string) {
    const current = await payslipRepository.getStatus(id);
    if (!current) throw new NotFoundError('Salary slip', id);

    const status = normalizePayslipStatus(current);
    if (!PAYSLIP_DELETABLE_STATUSES.includes(status)) {
      throw new AppError(
        400,
        `Only ${PAYSLIP_DELETABLE_STATUSES.map((s) => PAYSLIP_STATUS_LABELS[s]).join(', ')} payslips can be deleted. Cancel sent or downloaded payslips first.`,
      );
    }

    await payslipRepository.softDelete(id, deletedBy);
  }

  async updateStatus(id: string, input: UpdatePayslipStatusInput) {
    const currentRaw = await payslipRepository.getStatus(id);
    if (!currentRaw) throw new NotFoundError('Salary slip', id);

    const current = normalizePayslipStatus(currentRaw);
    const next = normalizePayslipStatus(input.status);
    const allowed = ALLOWED_PAYSLIP_TRANSITIONS[current] ?? [];

    if (!allowed.includes(next)) {
      throw new AppError(
        400,
        `Cannot transition from ${PAYSLIP_STATUS_LABELS[current]} to ${PAYSLIP_STATUS_LABELS[next]}.`,
      );
    }

    await payslipRepository.updateStatus(id, next, input.updatedBy);
    return this.getById(id);
  }

  async emailPayslip(id: string, updatedBy: string) {
    const currentRaw = await payslipRepository.getStatus(id);
    if (!currentRaw) throw new NotFoundError('Salary slip', id);

    const current = normalizePayslipStatus(currentRaw);
    if (current === 'generated' || current === 'failed') {
      await this.updateStatus(id, { status: 'sent', updatedBy, note: 'Payslip emailed to employee' });
    }

    const payslip = await this.getById(id);
    return { queued: true, slipNumber: payslip.slipNumber, status: payslip.status };
  }

  async bulkAction(input: BulkPayslipActionInput) {
    let processed = 0;
    const errors: string[] = [];

    for (const id of input.payslipIds) {
      try {
        if (input.action === 'email') {
          await this.emailPayslip(id, input.updatedBy);
        } else {
          const currentRaw = await payslipRepository.getStatus(id);
          if (!currentRaw) throw new NotFoundError('Salary slip', id);
          const current = normalizePayslipStatus(currentRaw);
          if (current === 'generated' || current === 'sent') {
            await this.updateStatus(id, {
              status: 'downloaded',
              updatedBy: input.updatedBy,
              note: 'Bulk download',
            });
          } else if (current === 'downloaded') {
            // already downloaded
          } else {
            throw new AppError(400, `Payslip ${id} cannot be marked downloaded from ${toApiPayslipStatus(current)}.`);
          }
        }
        processed++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    return { processed, failed: input.payslipIds.length - processed, errors };
  }
}

export const payslipService = new PayslipService();
