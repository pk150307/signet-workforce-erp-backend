import { Request, Response } from 'express';
import { employeeService } from './employee.service';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/response';
import { AppError } from '../../common/errors';
import { paramId } from '../../utils/request';
import {
  EmployeeLifecycleStatus,
  EmploymentType,
} from './employee.constants';
import { BulkImportRow } from './employee.types';

function parseEmployeeStatusQuery(
  value: unknown,
): EmployeeLifecycleStatus | 'all' {
  if (value === 'all') return 'all';
  if (value !== undefined && value !== '') {
    return Number(value) as EmployeeLifecycleStatus;
  }
  return EmployeeLifecycleStatus.Active;
}

export class EmployeeController {
  async getAll(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getAll({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      departmentId: req.query.departmentId as string | undefined,
      designationId: req.query.designationId as string | undefined,
      siteId: req.query.siteId as string | undefined,
      clientId: req.query.clientId as string | undefined,
      status: parseEmployeeStatusQuery(req.query.status),
      employmentType: req.query.employmentType
        ? (Number(req.query.employmentType) as EmploymentType)
        : undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortDir: req.query.sortDir as string | undefined,
    });
    sendSuccess(res, result);
  }

  async getDashboard(_req: Request, res: Response): Promise<void> {
    const result = await employeeService.getDashboardStats();
    sendSuccess(res, result);
  }

  async getRecent(req: Request, res: Response): Promise<void> {
    const limit = Number(req.query.limit) || 5;
    const result = await employeeService.getRecentEmployees(limit);
    sendSuccess(res, result);
  }

  async getActivities(req: Request, res: Response): Promise<void> {
    const limit = Number(req.query.limit) || 10;
    const result = await employeeService.getRecentActivities(limit);
    sendSuccess(res, result);
  }

  async generateCode(_req: Request, res: Response): Promise<void> {
    const result = await employeeService.generateEmployeeCode();
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getProfile(paramId(req));
    sendSuccess(res, result);
  }

  async getTimeline(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getTimeline(paramId(req));
    sendSuccess(res, result);
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getHistory(paramId(req));
    sendSuccess(res, result);
  }

  async getDocuments(req: Request, res: Response): Promise<void> {
    const result = await employeeService.getDocuments(paramId(req));
    sendSuccess(res, result);
  }

  async downloadDocument(req: Request, res: Response): Promise<void> {
    const employeeId = paramId(req);
    const documentId = paramId(req, 'documentId');
    const file = await employeeService.downloadDocument(employeeId, documentId);
    if (file.isRemote) {
      res.redirect(file.filePath);
      return;
    }
    res.download(file.filePath, file.fileName, { headers: { 'Content-Type': file.mimeType } });
  }

  async create(req: Request, res: Response): Promise<void> {
    const result = await employeeService.create({
      ...req.body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async saveDraft(req: Request, res: Response): Promise<void> {
    const result = await employeeService.saveDraft({
      ...req.body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async updateDraft(req: Request, res: Response): Promise<void> {
    if (paramId(req) !== req.body.id) {
      throw new AppError(400, 'ID mismatch.');
    }
    const result = await employeeService.saveDraft({
      ...req.body,
      id: paramId(req),
      createdBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result);
  }

  async submit(req: Request, res: Response): Promise<void> {
    const result = await employeeService.submit(paramId(req), req.user?.username ?? 'System');
    sendSuccess(res, result);
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

  async uploadDocument(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }
    const type = String(req.body.type ?? 'other');
    const label = String(req.body.label ?? req.file.originalname);
    const result = await employeeService.uploadDocument(
      paramId(req),
      type,
      label,
      req.file,
      req.user?.username ?? 'System',
    );
    sendCreated(res, result);
  }

  async deleteDocument(req: Request, res: Response): Promise<void> {
    await employeeService.deleteDocument(
      paramId(req),
      paramId(req, 'documentId'),
      req.user?.username ?? 'System',
    );
    sendNoContent(res);
  }

  async markLeft(req: Request, res: Response): Promise<void> {
    await employeeService.markLeft({
      employeeId: paramId(req),
      lastWorkingDate: req.body.lastWorkingDate,
      reason: req.body.reason,
      remarks: req.body.remarks,
      changedBy: req.user?.username ?? 'System',
    });
    sendNoContent(res);
  }

  async rejoin(req: Request, res: Response): Promise<void> {
    await employeeService.rejoin({
      employeeId: paramId(req),
      joiningDate: req.body.joiningDate,
      departmentId: req.body.departmentId,
      designationId: req.body.designationId,
      siteId: req.body.siteId,
      reportingManagerId: req.body.reportingManagerId,
      reuseEmployeeCode: req.body.reuseEmployeeCode ?? true,
      basicSalary: req.body.basicSalary,
      grossSalary: req.body.grossSalary,
      changedBy: req.user?.username ?? 'System',
    });
    sendNoContent(res);
  }

  async bulkImport(req: Request, res: Response): Promise<void> {
    const rows = (req.body.rows ?? req.body) as BulkImportRow[];
    if (!Array.isArray(rows)) {
      throw new AppError(400, 'Request body must contain an array of employee rows.');
    }
    const result = await employeeService.bulkImport(rows, req.user?.username ?? 'System');
    sendSuccess(res, result);
  }

  async exportEmployees(_req: Request, res: Response): Promise<void> {
    const csv = await employeeService.exportEmployees();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="employees-export.csv"');
    res.status(200).send(csv);
  }
}

export const employeeController = new EmployeeController();
