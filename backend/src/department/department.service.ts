import { NotFoundError } from '../../common/errors';
import { deleteApprovalService } from '../delete-requests/delete-requests.service';
import { DeleteActionContext, DeleteActionResult } from '../delete-requests/delete-requests.types';
import { IAM_MODULES } from '../iam/iam.constants';
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

  async delete(id: string, context: DeleteActionContext): Promise<DeleteActionResult> {
    const department = await departmentRepository.findById(id);
    if (!department) throw new NotFoundError('Department', id);

    return deleteApprovalService.handleDelete({
      module: IAM_MODULES.SETTINGS,
      entityType: 'Departments',
      entityId: id,
      entityLabel: department.departmentName,
      entitySnapshot: {
        id: department.id,
        departmentCode: department.departmentCode,
        departmentName: department.departmentName,
        clientId: department.clientId,
      },
      context,
    });
  }
}

export const departmentService = new DepartmentService();
