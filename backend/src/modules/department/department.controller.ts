import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import {
  sendDeleteActionResult,
  toDeleteActionContext,
} from '../delete-requests/delete-action.util';
import { departmentService } from './department.service';
import { CreateDepartmentInput, UpdateDepartmentInput } from './department.types';

export class DepartmentController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await departmentService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      clientId: req.query.clientId as string | undefined,
      search: req.query.search as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await departmentService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateDepartmentInput, 'createdBy'>;
    const result = await departmentService.create({
      ...body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async generateCode(req: Request, res: Response): Promise<void> {
    const clientId = String(req.query.clientId ?? '');
    const result = await departmentService.generateDepartmentCode(clientId);
    sendSuccess(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateDepartmentInput, 'id' | 'createdBy'>;
    const result = await departmentService.update({
      ...body,
      id: paramId(req),
      createdBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async delete(req: Request, res: Response): Promise<void> {
    const result = await departmentService.delete(
      paramId(req),
      toDeleteActionContext(req.user, req.body?.reason),
    );
    sendDeleteActionResult(res, result);
  }
}

export const departmentController = new DepartmentController();
