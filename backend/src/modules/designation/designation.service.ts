import { NotFoundError } from '../../common/errors';
import { deleteApprovalService } from '../delete-requests/delete-requests.service';
import { DeleteActionContext, DeleteActionResult } from '../delete-requests/delete-requests.types';
import { IAM_MODULES } from '../iam/iam.constants';
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

  generateDesignationCode(departmentId: string, clientId?: string) {
    return designationRepository
      .getNextDesignationCode(departmentId, clientId)
      .then((code) => ({ code }));
  }

  async update(input: UpdateDesignationInput) {
    const existing = await designationRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Designation', input.id);
    await designationRepository.update(input);
    return designationRepository.findById(input.id);
  }

  async delete(id: string, context: DeleteActionContext): Promise<DeleteActionResult> {
    const designation = await designationRepository.findById(id);
    if (!designation) throw new NotFoundError('Designation', id);

    return deleteApprovalService.handleDelete({
      module: IAM_MODULES.SETTINGS,
      entityType: 'Designations',
      entityId: id,
      entityLabel: designation.designationName,
      entitySnapshot: {
        id: designation.id,
        designationCode: designation.designationCode,
        designationName: designation.designationName,
      },
      context,
    });
  }
}

export const designationService = new DesignationService();
