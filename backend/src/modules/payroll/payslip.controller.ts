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
      employeeIds: Array.isArray(req.body.employeeIds) ? req.body.employeeIds : undefined,
      clientId: req.body.clientId as string | undefined,
      departmentId: req.body.departmentId as string | undefined,
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
      clientId: req.query.clientId as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
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

  async delete(req: Request, res: Response): Promise<void> {
    await payslipService.deletePayslip(paramId(req), req.user?.username ?? 'System');
    sendSuccess(res, { deleted: true });
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    const result = await payslipService.updateStatus(paramId(req), {
      status: String(req.body.status).toLowerCase(),
      updatedBy: req.user?.username ?? 'System',
      note: req.body.note as string | undefined,
    });
    sendSuccess(res, result);
  }

  async email(req: Request, res: Response): Promise<void> {
    const result = await payslipService.emailPayslip(paramId(req), req.user?.username ?? 'System');
    sendSuccess(res, result);
  }

  async bulkAction(req: Request, res: Response): Promise<void> {
    const result = await payslipService.bulkAction({
      payslipIds: Array.isArray(req.body.payslipIds) ? req.body.payslipIds : [],
      action: req.body.action === 'email' ? 'email' : 'download',
      updatedBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result);
  }
}

export const payslipController = new PayslipController();
