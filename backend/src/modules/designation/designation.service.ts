import { NotFoundError } from '../../common/errors';
import { designationRepository } from './designation.repository';
import { CreateDesignationInput, DesignationFilter, UpdateDesignationInput } from './designation.types';

export class DesignationService {
  list(filter: DesignationFilter) {
    return designationRepository.findAll(filter);
  }

  async getById(id: string) {
    const item = await designationRepository.findById(id);
    if (!item) throw new NotFoundError('Designation', id);
    return item;
  }

  create(input: CreateDesignationInput) {
    return designationRepository.create(input);
  }

  generateDesignationCode(departmentId: string) {
    return designationRepository.getNextDesignationCode(departmentId).then((code) => ({ code }));
  }

  async update(input: UpdateDesignationInput) {
    const existing = await designationRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Designation', input.id);
    await designationRepository.update(input);
    return designationRepository.findById(input.id);
  }

  async delete(id: string, deletedBy: string) {
    const deleted = await designationRepository.softDelete(id, deletedBy);
    if (!deleted) throw new NotFoundError('Designation', id);
  }
}

export const designationService = new DesignationService();
