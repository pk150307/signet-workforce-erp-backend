import { NotFoundError } from '../../common/errors';
import { departmentRepository } from './department.repository';
import { CreateDepartmentInput, DepartmentFilter, UpdateDepartmentInput } from './department.types';

export class DepartmentService {
  list(filter: DepartmentFilter) {
    return departmentRepository.findAll(filter);
  }

  async getById(id: string) {
    const item = await departmentRepository.findById(id);
    if (!item) throw new NotFoundError('Department', id);
    return item;
  }

  create(input: CreateDepartmentInput) {
    return departmentRepository.create(input);
  }

  generateDepartmentCode(clientId: string) {
    return departmentRepository.getNextDepartmentCode(clientId).then((code) => ({ code }));
  }

  async update(input: UpdateDepartmentInput) {
    const existing = await departmentRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Department', input.id);
    await departmentRepository.update(input);
    return departmentRepository.findById(input.id);
  }

  async delete(id: string, deletedBy: string) {
    const deleted = await departmentRepository.softDelete(id, deletedBy);
    if (!deleted) throw new NotFoundError('Department', id);
  }
}

export const departmentService = new DepartmentService();
