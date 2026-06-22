import { companyRepository } from './company.repository';
import { CompanyListFilter, UpdateCompanyProfileInput } from './company.types';
import { NotFoundError } from '../../common/errors';

export class CompanyService {
  getProfile() {
    return companyRepository.getProfile();
  }

  updateProfile(input: UpdateCompanyProfileInput) {
    return companyRepository.updateProfile(input);
  }

  listBranches(filter: CompanyListFilter) {
    return companyRepository.findBranches(filter);
  }

  listOffices(filter: CompanyListFilter) {
    return companyRepository.findOffices(filter);
  }

  async deleteBranch(id: string, deletedBy: string) {
    const deleted = await companyRepository.softDeleteBranch(id, deletedBy);
    if (!deleted) throw new NotFoundError('Branch', id);
  }

  async deleteOffice(id: string, deletedBy: string) {
    const deleted = await companyRepository.softDeleteOffice(id, deletedBy);
    if (!deleted) throw new NotFoundError('Office', id);
  }
}

export const companyService = new CompanyService();
