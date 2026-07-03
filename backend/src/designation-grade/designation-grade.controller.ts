import { Request, Response } from 'express';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { designationGradeService } from './designation-grade.service';
import {
  CreateDesignationGradeInput,
  UpdateDesignationGradeInput,
} from './designation-grade.types';

export class DesignationGradeController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await designationGradeService.list({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
      clientId: req.query.clientId as string | undefined,
      designationId: req.query.designationId as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
      search: req.query.search as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async listByDesignation(req: Request, res: Response): Promise<void> {
    const result = await designationGradeService.listByDesignation(paramId(req, 'designationId'));
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await designationGradeService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateDesignationGradeInput, 'createdBy'>;
    const result = await designationGradeService.create({
      ...body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateDesignationGradeInput, 'id' | 'createdBy'>;
    const result = await designationGradeService.update({
      ...body,
      id: paramId(req),
      createdBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await designationGradeService.delete(paramId(req), req.user?.username ?? 'System');
    sendNoContent(res);
  }
}

export const designationGradeController = new DesignationGradeController();
