import { Request, Response } from 'express';
import { billingConfigurationService } from './billing-configuration.service';
import {
  CreateBillingConfigurationInput,
  UpdateBillingConfigurationInput,
} from './billing-configuration.types';
import { sendCreated, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';

export class BillingConfigurationController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await billingConfigurationService.list({
      pageSize: Number(req.query.pageSize) || 10,
      cursor: req.query.cursor as string | undefined,
      direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
      clientId: req.query.clientId as string | undefined,
      siteId: req.query.siteId as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      search: req.query.search as string | undefined,
    });
    sendSuccess(res, result);
  }

  async listComponents(_req: Request, res: Response): Promise<void> {
    const result = await billingConfigurationService.listComponents();
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await billingConfigurationService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async getBySiteId(req: Request, res: Response): Promise<void> {
    const result = await billingConfigurationService.getBySiteId(paramId(req, 'siteId'));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateBillingConfigurationInput, 'createdBy'>;
    const result = await billingConfigurationService.create({
      ...body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateBillingConfigurationInput, 'id' | 'updatedBy'>;
    const result = await billingConfigurationService.update({
      ...body,
      id: paramId(req),
      updatedBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await billingConfigurationService.delete(paramId(req), req.user?.username ?? 'System');
    sendSuccess(res, { deleted: true });
  }
}

export const billingConfigurationController = new BillingConfigurationController();
