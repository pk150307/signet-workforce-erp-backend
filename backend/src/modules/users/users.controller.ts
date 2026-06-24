import { Request, Response } from 'express';
import { usersService } from './users.service';
import { getAuthContext } from '../auth/auth.context';
import { sendCreated, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import {
  CreateUserInput,
  UpdateUserInput,
  UpdateUserStatusInput,
} from './users.types';

function actor(req: Request) {
  return {
    userId: req.user!.userId,
    username: req.user!.username,
    roles: req.user!.roles,
  };
}

export class UsersController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await usersService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      status: req.query.status as string | undefined,
      roleId: req.query.roleId as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
    });
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await usersService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateUserInput, 'createdBy'>;
    const result = await usersService.create(
      { ...body, createdBy: req.user!.username },
      actor(req),
    );
    sendCreated(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateUserInput, 'id' | 'updatedBy'>;
    const result = await usersService.update(
      { ...body, id: paramId(req), updatedBy: req.user!.username },
      actor(req),
    );
    sendSuccess(res, result);
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateUserStatusInput, 'id' | 'updatedBy'>;
    const result = await usersService.updateStatus(
      {
        id: paramId(req),
        isActive: body.isActive,
        unlockAccount: body.unlockAccount,
        updatedBy: req.user!.username,
      },
      { userId: req.user!.userId, username: req.user!.username },
    );
    sendSuccess(res, result);
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const context = getAuthContext(req);
    const result = await usersService.resetPassword({
      userId: paramId(req),
      mode: req.body.mode,
      temporaryPassword: req.body.temporaryPassword,
      forcePasswordReset: req.body.forcePasswordReset,
      actorUserId: req.user!.userId,
      actorUsername: req.user!.username,
      ipAddress: context.ipAddress,
    });
    sendSuccess(res, result);
  }

  async loginHistory(req: Request, res: Response): Promise<void> {
    const result = await usersService.getLoginHistory(paramId(req), {
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      loginStatus: req.query.loginStatus as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      search: req.query.search as string | undefined,
      isNewDevice:
        req.query.isNewDevice === 'true' ? true : req.query.isNewDevice === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }
}

export const usersController = new UsersController();
