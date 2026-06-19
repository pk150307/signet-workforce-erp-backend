import { payslipRepository } from './payslip.repository';
import { GeneratePayslipsInput, PayslipFilter } from './payslip.types';
import { NotFoundError } from '../../common/errors';

export class PayslipService {
  async generate(input: GeneratePayslipsInput) {
    const count = await payslipRepository.generateForPeriod(input);
    return { generated: count, month: input.month, year: input.year };
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
}

export const payslipService = new PayslipService();
