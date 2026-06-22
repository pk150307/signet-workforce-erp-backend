import { Request, Response } from 'express';
import { statutoryService } from './statutory.service';
import { UpsertPfEsicInput } from './statutory.types';
import { parseStatutoryFilter } from './statutory.utils';
import { sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';

export class StatutoryController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await statutoryService.list(parseStatutoryFilter(req));
    sendSuccess(res, result);
  }

  async export(req: Request, res: Response): Promise<void> {
    const csv = await statutoryService.export(parseStatutoryFilter(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pf-esic-export.csv"');
    res.status(200).send(csv);
  }

  async getByEmployeeId(req: Request, res: Response): Promise<void> {
    const result = await statutoryService.getByEmployeeId(paramId(req, 'employeeId'));
    sendSuccess(res, result);
  }

  async upsert(req: Request, res: Response): Promise<void> {
    const body = req.body as Record<string, unknown>;
    const effectiveDate = (body.effectiveDate ?? body.pfJoiningDate ?? body.esiJoiningDate) as
      | string
      | undefined;

    const result = await statutoryService.upsert({
      ...(body as Omit<UpsertPfEsicInput, 'employeeId' | 'updatedBy'>),
      employeeId: paramId(req, 'employeeId'),
      updatedBy: req.user?.username ?? 'System',
      esiNumber: (body.esiNumber ?? body.esicNumber) as string | undefined,
      effectiveDate,
      pfJoiningDate: (body.pfJoiningDate as string | undefined) ?? effectiveDate,
      esiJoiningDate: (body.esiJoiningDate as string | undefined) ?? effectiveDate,
      status: body.status as UpsertPfEsicInput['status'],
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
