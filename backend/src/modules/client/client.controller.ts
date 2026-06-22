import { Request, Response } from 'express';
import { clientService } from './client.service';
import { CreateClientInput, UpdateClientInput } from './client.types';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';

export class ClientController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await clientService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await clientService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateClientInput, 'createdBy'>;
    const result = await clientService.create({
      ...body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateClientInput, 'id' | 'createdBy'>;
    const result = await clientService.update({
      ...body,
      id: paramId(req),
      createdBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await clientService.delete(paramId(req), req.user?.username ?? 'System');
    sendNoContent(res);
  }

  async listSites(req: Request, res: Response): Promise<void> {
    const result = await clientService.listSites(
      paramId(req),
      Number(req.query.page) || 1,
      Number(req.query.pageSize) || 100,
    );
    sendSuccess(res, result);
  }
}

export const clientController = new ClientController();
