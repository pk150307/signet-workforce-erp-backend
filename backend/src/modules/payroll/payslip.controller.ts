import { Request, Response } from 'express';
import { payslipService } from './payslip.service';
import { sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';

export class PayslipController {
  async generate(req: Request, res: Response): Promise<void> {
    const result = await payslipService.generate({
      month: Number(req.body.month),
      year: Number(req.body.year),
      createdBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result);
  }

  async list(req: Request, res: Response): Promise<void> {
    const result = await payslipService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      employeeId: req.query.employeeId as string | undefined,
    });
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await payslipService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async print(req: Request, res: Response): Promise<void> {
    const result = await payslipService.getPrintData(paramId(req));
    sendSuccess(res, result);
  }
}

export const payslipController = new PayslipController();
