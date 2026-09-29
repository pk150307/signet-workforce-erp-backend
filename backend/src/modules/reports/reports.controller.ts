import { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import { reportsService } from './reports.service';
import { ReportFilter } from './reports.types';

function parseFilter(req: Request): ReportFilter {
  const month = req.query.month ? Number(req.query.month) : undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;
  const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
  return {
    month: Number.isFinite(month) && month! >= 1 && month! <= 12 ? month : undefined,
    year: Number.isFinite(year) && year! >= 2000 && year! <= 2100 ? year : undefined,
    clientId: clientId && clientId !== 'all' ? clientId : undefined,
  };
}

export class ReportsController {
  async attendance(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await reportsService.getAttendance(parseFilter(req)));
  }

  async payroll(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await reportsService.getPayroll(parseFilter(req)));
  }

  async invoices(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await reportsService.getInvoices(parseFilter(req)));
  }

  async employees(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await reportsService.getEmployees(parseFilter(req)));
  }
}

export const reportsController = new ReportsController();
