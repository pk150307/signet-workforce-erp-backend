import { Request, Response } from 'express';
import { siteService } from './site.service';
import { CreateSiteInput, UpdateSiteInput } from './site.types';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';

export class SiteController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await siteService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      clientId: req.query.clientId as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async getSummary(_req: Request, res: Response): Promise<void> {
    const result = await siteService.getSummary();
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await siteService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateSiteInput, 'createdBy'>;
    const result = await siteService.create({
      ...body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateSiteInput, 'id' | 'createdBy'>;
    const result = await siteService.update({
      ...body,
      id: paramId(req),
      createdBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await siteService.delete(paramId(req), req.user?.username ?? 'System');
    sendNoContent(res);
  }
}

export const siteController = new SiteController();
