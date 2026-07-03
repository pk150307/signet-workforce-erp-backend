import { Request, Response } from 'express';
import { deleteRequestsService } from './delete-requests.service';
import { sendCreated, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { DeleteRequestFilter } from './delete-requests.types';

export class DeleteRequestsController {
  async list(req: Request, res: Response): Promise<void> {
    const filter: DeleteRequestFilter = {
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      status: req.query.status as string | undefined,
      module: req.query.module as string | undefined,
      entityType: req.query.entityType as string | undefined,
      requestedBy: req.query.requestedBy as string | undefined,
      reviewedBy: req.query.reviewedBy as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      search: req.query.search as string | undefined,
    };
    const result = await deleteRequestsService.list(filter);
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await deleteRequestsService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const id = await deleteRequestsService.create({
      module: req.body.module,
      entityType: req.body.entityType,
      entityId: req.body.entityId,
      entityLabel: req.body.entityLabel,
      reason: req.body.reason,
      entitySnapshot: req.body.entitySnapshot,
      requestedByUserId: req.user!.userId,
      createdBy: req.user!.username,
    });
    sendCreated(res, { id, message: 'Delete request submitted for approval.' });
  }

  async approve(req: Request, res: Response): Promise<void> {
    const result = await deleteRequestsService.approve({
      id: paramId(req),
      reviewedByUserId: req.user!.userId,
      reviewedByUsername: req.user!.username,
    });
    sendSuccess(res, result);
  }

  async reject(req: Request, res: Response): Promise<void> {
    const result = await deleteRequestsService.reject({
      id: paramId(req),
      reviewedByUserId: req.user!.userId,
      reviewedByUsername: req.user!.username,
      rejectionRemarks: req.body.rejectionRemarks,
    });
    sendSuccess(res, result);
  }
}

export const deleteRequestsController = new DeleteRequestsController();
