import { Request, Response } from 'express';
import { employeeService } from './employee.service';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/response';
import { EmployeeStatus, EmploymentType } from '../../types/enums';
import { AppError } from '../../common/errors';
import { paramId } from '../../utils/request';

export class EmployeeController {
  async getAll(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getAll({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
      designationId: req.query.designationId as string | undefined,
      siteId: req.query.siteId as string | undefined,
      status: req.query.status ? (Number(req.query.status) as EmployeeStatus) : undefined,
      employmentType: req.query.employmentType
        ? (Number(req.query.employmentType) as EmploymentType)
        : undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortDir: req.query.sortDir as string | undefined,
    });
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const id = await employeeService.create({
      ...req.body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, { id });
  }

  async update(req: Request, res: Response): Promise<void> {
    if (paramId(req) !== req.body.id) {
      throw new AppError(400, 'ID mismatch.');
    }
    await employeeService.update({
      ...req.body,
      createdBy: req.user?.username ?? 'System',
    });
    sendNoContent(res);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await employeeService.delete(paramId(req), req.user?.username ?? 'System');
    sendNoContent(res);
  }

  async uploadPhoto(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError(400, 'No photo uploaded');
    }
    const result = await employeeService.uploadPhoto(
      paramId(req),
      req.file,
      req.user?.username ?? 'System',
    );
    sendSuccess(res, result);
  }
}

export const employeeController = new EmployeeController();
