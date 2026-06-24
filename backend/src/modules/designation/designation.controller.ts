import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import {
  sendDeleteActionResult,
  toDeleteActionContext,
} from '../delete-requests/delete-action.util';
import { designationService } from './designation.service';
import { CreateDesignationInput, UpdateDesignationInput } from './designation.types';

export class DesignationController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await designationService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      clientId: req.query.clientId as string | undefined,
      search: req.query.search as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
      gradeCode: req.query.gradeCode as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await designationService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateDesignationInput, 'createdBy'>;
    const result = await designationService.create({
      ...body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async generateCode(req: Request, res: Response): Promise<void> {
    const departmentId = String(req.query.departmentId ?? '');
    const clientId = req.query.clientId as string | undefined;
    const result = await designationService.generateDesignationCode(departmentId, clientId);
    sendSuccess(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateDesignationInput, 'id' | 'createdBy'>;
    const result = await designationService.update({
      ...body,
      id: paramId(req),
      createdBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async delete(req: Request, res: Response): Promise<void> {
    const result = await designationService.delete(
      paramId(req),
      toDeleteActionContext(req.user, req.body?.reason),
    );
    sendDeleteActionResult(res, result);
  }
}

export const designationController = new DesignationController();
