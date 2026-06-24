import { Request, Response } from 'express';
import { rolesService } from './roles.service';
import { sendCreated, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { CreateRoleInput, UpdateRoleInput } from './roles.types';

function actor(req: Request) {
  return {
    userId: req.user!.userId,
    username: req.user!.username,
  };
}

export class RolesController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await rolesService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      isSystem:
        req.query.isSystem === 'true' ? true : req.query.isSystem === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await rolesService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateRoleInput, 'createdBy'>;
    const result = await rolesService.create(
      { ...body, createdBy: req.user!.username },
      actor(req),
    );
    sendCreated(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateRoleInput, 'id' | 'updatedBy'>;
    const result = await rolesService.update(
      { ...body, id: paramId(req), updatedBy: req.user!.username },
      actor(req),
    );
    sendSuccess(res, result);
  }

  async updatePermissions(req: Request, res: Response): Promise<void> {
    const result = await rolesService.updatePermissions(
      {
        roleId: paramId(req),
        permissionIds: req.body.permissionIds,
        updatedBy: req.user!.username,
      },
      actor(req),
    );
    sendSuccess(res, result);
  }

  async listPermissions(req: Request, res: Response): Promise<void> {
    const groupByModule = String(req.query.groupByModule ?? '') === 'true';
    const result = await rolesService.listPermissions({
      module: req.query.module as string | undefined,
      groupByModule,
    });
    sendSuccess(res, result);
  }
}

export const rolesController = new RolesController();
