import { Request, Response } from 'express';
import { sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { auditLogsService } from './audit-logs.service';
import { AuditLogFilter } from './audit-logs.types';

function parseFilter(req: Request): AuditLogFilter {
  return {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    userId: req.query.userId as string | undefined,
    module: req.query.module as string | undefined,
    action: req.query.action as string | undefined,
    entityType: req.query.entityType as string | undefined,
    entityId: req.query.entityId as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    ipAddress: req.query.ipAddress as string | undefined,
    search: req.query.search as string | undefined,
  };
}

export class AuditLogsController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await auditLogsService.list(parseFilter(req));
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await auditLogsService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async summary(req: Request, res: Response): Promise<void> {
    const result = await auditLogsService.getSummary({
      userId: req.query.userId as string | undefined,
      module: req.query.module as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    });
    sendSuccess(res, result);
  }

  async export(req: Request, res: Response): Promise<void> {
    const csv = await auditLogsService.export(parseFilter(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs-export.csv"');
    res.status(200).send(csv);
  }
}

export const auditLogsController = new AuditLogsController();
