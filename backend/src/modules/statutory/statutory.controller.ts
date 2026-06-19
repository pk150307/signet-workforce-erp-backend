import { Request, Response } from 'express';
import { statutoryService } from './statutory.service';
import { UpsertPfEsicInput } from './statutory.types';
import { sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';

export class StatutoryController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await statutoryService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      siteId: req.query.siteId as string | undefined,
      pfApplicable: req.query.pfApplicable === 'true' ? true : req.query.pfApplicable === 'false' ? false : undefined,
      esiApplicable: req.query.esiApplicable === 'true' ? true : req.query.esiApplicable === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async getByEmployeeId(req: Request, res: Response): Promise<void> {
    const result = await statutoryService.getByEmployeeId(paramId(req, 'employeeId'));
    sendSuccess(res, result);
  }

  async upsert(req: Request, res: Response): Promise<void> {
    const result = await statutoryService.upsert({
      ...req.body,
      employeeId: paramId(req, 'employeeId'),
      updatedBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async bulkUpsert(req: Request, res: Response): Promise<void> {
    const items = (req.body.items as Omit<UpsertPfEsicInput, 'updatedBy'>[]).map((item) => ({
      ...item,
      updatedBy: req.user?.username ?? 'System',
    }));
    const result = await statutoryService.bulkUpsert(items);
    sendSuccess(res, { updated: result.length, items: result });
  }
}

export const statutoryController = new StatutoryController();
