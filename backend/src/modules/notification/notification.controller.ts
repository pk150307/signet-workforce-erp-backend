import { Request, Response } from 'express';
import { sendNoContent, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { notificationService } from './notification.service';
import { NotificationFilter } from './notification.types';

function parseFilter(req: Request): NotificationFilter {
  return {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    userId: req.user!.userId,
    unreadOnly: req.query.unreadOnly === 'true' ? true : undefined,
    notificationType: req.query.notificationType as string | undefined,
    referenceType: req.query.referenceType as string | undefined,
    referenceId: req.query.referenceId as string | undefined,
    priority: req.query.priority as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    search: req.query.search as string | undefined,
  };
}

export class NotificationController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await notificationService.list(parseFilter(req));
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await notificationService.getById(paramId(req), req.user!.userId);
    sendSuccess(res, result);
  }

  async summary(req: Request, res: Response): Promise<void> {
    const result = await notificationService.getSummary(req.user!.userId);
    sendSuccess(res, result);
  }

  async markRead(req: Request, res: Response): Promise<void> {
    await notificationService.markRead(paramId(req), req.user!.userId, req.user!.username);
    sendNoContent(res);
  }

  async markAllRead(req: Request, res: Response): Promise<void> {
    const count = await notificationService.markAllRead(req.user!.userId, req.user!.username);
    sendSuccess(res, { markedCount: count });
  }

  async markUnread(req: Request, res: Response): Promise<void> {
    await notificationService.markUnread(paramId(req), req.user!.userId, req.user!.username);
    sendNoContent(res);
  }

  async dismiss(req: Request, res: Response): Promise<void> {
    await notificationService.dismiss(paramId(req), req.user!.userId, req.user!.username);
    sendNoContent(res);
  }
}

export const notificationController = new NotificationController();
