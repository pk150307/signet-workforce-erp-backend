import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/response';
import { parsePageSize } from '../../types';
import { paramId } from '../../utils/request';
import { salaryRegisterService } from './salary-register.service';
import { SalaryRegisterFilter, SalaryRegisterStatus } from './salary-register.types';

function actor(req: Request): string {
  return req.user?.username ?? 'System';
}

export class SalaryRegisterController {
  async list(req: Request, res: Response): Promise<void> {
    const filter: SalaryRegisterFilter = {
      pageSize: parsePageSize(req.query.pageSize),
      cursor: (req.query.cursor as string) || null,
      direction: req.query.direction === 'prev' ? 'prev' : 'next',
      clientId: req.query.clientId as string | undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      status: req.query.status as SalaryRegisterStatus | undefined,
      search: req.query.search as string | undefined,
    };
    const result = await salaryRegisterService.list(filter);
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const detail = await salaryRegisterService.getById(paramId(req));
    sendSuccess(res, detail);
  }

  async generate(req: Request, res: Response): Promise<void> {
    const detail = await salaryRegisterService.generate({
      clientId: req.body.clientId,
      month: Number(req.body.month),
      year: Number(req.body.year),
      createdBy: actor(req),
    });
    sendCreated(res, detail);
  }

  async recalculate(req: Request, res: Response): Promise<void> {
    const detail = await salaryRegisterService.recalculate(paramId(req), actor(req));
    sendSuccess(res, detail);
  }

  async updateEmployeeRow(req: Request, res: Response): Promise<void> {
    const detail = await salaryRegisterService.updateEmployeeRow(
      paramId(req),
      paramId(req, 'employeeRowId'),
      {
        payDays: req.body.payDays != null ? Number(req.body.payDays) : undefined,
        nAll: req.body.nAll != null ? Number(req.body.nAll) : undefined,
        attAwAfd: req.body.attAwAfd != null ? Number(req.body.attAwAfd) : undefined,
      },
      actor(req),
    );
    sendSuccess(res, detail);
  }

  async finalize(req: Request, res: Response): Promise<void> {
    const detail = await salaryRegisterService.finalize(paramId(req), actor(req));
    sendSuccess(res, detail);
  }

  async reopen(req: Request, res: Response): Promise<void> {
    const detail = await salaryRegisterService.reopen(
      paramId(req),
      actor(req),
      req.body.reason as string | undefined,
    );
    sendSuccess(res, detail);
  }

  async exportExcel(req: Request, res: Response): Promise<void> {
    const id = paramId(req);
    const buffer = await salaryRegisterService.exportExcel(id);
    const detail = await salaryRegisterService.getById(id);
    const filename = `salary-register-${detail.clientCode || detail.clientId}-${detail.year}-${String(detail.month).padStart(2, '0')}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  async exportPdf(req: Request, res: Response): Promise<void> {
    const id = paramId(req);
    const buffer = await salaryRegisterService.exportPdf(id);
    const detail = await salaryRegisterService.getById(id);
    const filename = `salary-register-${detail.clientCode || detail.clientId}-${detail.year}-${String(detail.month).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}

export const salaryRegisterController = new SalaryRegisterController();
