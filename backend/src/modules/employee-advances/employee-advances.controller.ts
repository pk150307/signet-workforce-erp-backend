import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/response';
import { parsePageSize } from '../../types';
import { paramId } from '../../utils/request';
import { employeeAdvancesService } from './employee-advances.service';
import { EmployeeAdvanceFilter, EmployeeAdvanceStatus } from './employee-advances.types';

function actor(req: Request): string {
  return req.user?.username ?? 'System';
}

export class EmployeeAdvancesController {
  async list(req: Request, res: Response): Promise<void> {
    const filter: EmployeeAdvanceFilter = {
      pageSize: parsePageSize(req.query.pageSize),
      cursor: (req.query.cursor as string) || null,
      direction: req.query.direction === 'prev' ? 'prev' : 'next',
      clientId: req.query.clientId as string | undefined,
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      status: req.query.status as EmployeeAdvanceStatus | undefined,
      search: req.query.search as string | undefined,
    };
    const result = await employeeAdvancesService.list(filter);
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.getById(paramId(req));
    sendSuccess(res, detail);
  }

  async generate(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.generate({
      clientId: req.body.clientId,
      month: Number(req.body.month),
      year: Number(req.body.year),
      createdBy: actor(req),
    });
    sendCreated(res, detail);
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.refresh(paramId(req), actor(req));
    sendSuccess(res, detail);
  }

  async addPayment(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.addPayment(
      paramId(req),
      paramId(req, 'entryId'),
      {
        paidOn: String(req.body.paidOn).slice(0, 10),
        amount: Number(req.body.amount),
        notes: req.body.notes !== undefined ? req.body.notes : undefined,
      },
      actor(req),
    );
    sendSuccess(res, detail);
  }

  async updatePayment(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.updatePayment(
      paramId(req),
      paramId(req, 'entryId'),
      paramId(req, 'paymentId'),
      {
        paidOn: String(req.body.paidOn).slice(0, 10),
        amount: Number(req.body.amount),
        notes: req.body.notes !== undefined ? req.body.notes : undefined,
      },
      actor(req),
    );
    sendSuccess(res, detail);
  }

  async deletePayment(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.deletePayment(
      paramId(req),
      paramId(req, 'entryId'),
      paramId(req, 'paymentId'),
      actor(req),
    );
    sendSuccess(res, detail);
  }

  async finalize(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.finalize(paramId(req), actor(req));
    sendSuccess(res, detail);
  }

  async reopen(req: Request, res: Response): Promise<void> {
    const detail = await employeeAdvancesService.reopen(
      paramId(req),
      actor(req),
      req.body.reason as string | undefined,
    );
    sendSuccess(res, detail);
  }

  async exportExcel(req: Request, res: Response): Promise<void> {
    const id = paramId(req);
    const buffer = await employeeAdvancesService.exportExcel(id);
    const detail = await employeeAdvancesService.getById(id);
    const filename = `employee-advances-${detail.clientCode || detail.clientId}-${detail.year}-${String(detail.month).padStart(2, '0')}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  async exportPdf(req: Request, res: Response): Promise<void> {
    const id = paramId(req);
    const buffer = await employeeAdvancesService.exportPdf(id);
    const detail = await employeeAdvancesService.getById(id);
    const filename = `employee-advances-${detail.clientCode || detail.clientId}-${detail.year}-${String(detail.month).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}

export const employeeAdvancesController = new EmployeeAdvancesController();
