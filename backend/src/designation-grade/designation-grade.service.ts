import { NotFoundError } from '../../common/errors';
import { designationGradeRepository } from './designation-grade.repository';
import {
  CreateDesignationGradeInput,
  DesignationGradeFilter,
  UpdateDesignationGradeInput,
} from './designation-grade.types';

export class DesignationGradeService {
  list(filter: DesignationGradeFilter) {
    return designationGradeRepository.findAll(filter);
  }

  listByDesignation(designationId: string) {
    return designationGradeRepository.findByDesignationId(designationId);
  }

  async getById(id: string) {
    const item = await designationGradeRepository.findById(id);
    if (!item) throw new NotFoundError('Designation grade', id);
    return item;
  }

  create(input: CreateDesignationGradeInput) {
    return designationGradeRepository.create(input);
  }

  async update(input: UpdateDesignationGradeInput) {
    const existing = await designationGradeRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Designation grade', input.id);
    await designationGradeRepository.update(input);
    return designationGradeRepository.findById(input.id);
  }

  async delete(id: string, deletedBy: string) {
    const deleted = await designationGradeRepository.softDelete(id, deletedBy);
    if (!deleted) throw new NotFoundError('Designation grade', id);
  }
}

export const designationGradeService = new DesignationGradeService();
