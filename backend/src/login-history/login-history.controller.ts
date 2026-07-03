import { Request, Response } from 'express';
import { loginHistoryService } from './login-history.service';
import { sendSuccess } from '../../common/response';
import { LoginHistoryFilter } from './login-history.types';

function parseFilter(req: Request, overrides: Partial<LoginHistoryFilter> = {}): LoginHistoryFilter {
  return {
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 20,
    userId: (req.query.userId as string | undefined) ?? overrides.userId,
    loginStatus: req.query.loginStatus as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    search: req.query.search as string | undefined,
    isNewDevice:
      req.query.isNewDevice === 'true' ? true : req.query.isNewDevice === 'false' ? false : undefined,
    ...overrides,
  };
}

export class LoginHistoryController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await loginHistoryService.list(parseFilter(req));
    sendSuccess(res, result);
  }

  async summary(req: Request, res: Response): Promise<void> {
    const userId = req.query.userId as string | undefined;
    const summary = await loginHistoryService.getSummary(userId);
    sendSuccess(res, summary);
  }

  async myHistory(req: Request, res: Response): Promise<void> {
    const result = await loginHistoryService.listForUser(
      req.user!.userId,
      parseFilter(req, { userId: req.user!.userId }),
    );
    sendSuccess(res, result);
  }

  async mySummary(req: Request, res: Response): Promise<void> {
    const summary = await loginHistoryService.getSummary(req.user!.userId);
    sendSuccess(res, summary);
  }
}

export const loginHistoryController = new LoginHistoryController();
