import { Request, Response } from 'express';
import { companyService } from './company.service';
import { sendNoContent, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { UpdateCompanyProfileInput } from './company.types';

export class CompanyController {
  async getProfile(_req: Request, res: Response): Promise<void> {
    const profile = await companyService.getProfile();
    sendSuccess(res, profile);
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateCompanyProfileInput, 'updatedBy'>;
    const result = await companyService.updateProfile({
      ...body,
      updatedBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result);
  }

  async listBranches(req: Request, res: Response): Promise<void> {
    const result = await companyService.listBranches({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async listOffices(req: Request, res: Response): Promise<void> {
    const result = await companyService.listOffices({
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 20,
      search: req.query.search as string | undefined,
      isActive:
        req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
    });
    sendSuccess(res, result);
  }

  async deleteBranch(req: Request, res: Response): Promise<void> {
    await companyService.deleteBranch(paramId(req), req.user?.username ?? 'System');
    sendNoContent(res);
  }

  async deleteOffice(req: Request, res: Response): Promise<void> {
    await companyService.deleteOffice(paramId(req), req.user?.username ?? 'System');
    sendNoContent(res);
  }
}

export const companyController = new CompanyController();
