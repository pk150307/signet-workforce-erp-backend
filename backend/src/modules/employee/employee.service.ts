import { employeeRepository } from './employee.repository';
import { documentsService } from '../documents/documents.service';
import { DocumentType } from '../documents/documents.types';
import { CreateEmployeeInput, EmployeeFilter, UpdateEmployeeInput } from './employee.types';
import { NotFoundError, AppError } from '../../common/errors';

export class EmployeeService {
  getAll(filter: EmployeeFilter) {
    return employeeRepository.findAll(filter);
  }

  async getById(id: string) {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw new NotFoundError('Employee', id);
    return employee;
  }

  async create(input: CreateEmployeeInput) {
    if (await employeeRepository.emailExists(input.email)) {
      throw new AppError(400, `An employee with email '${input.email}' already exists.`);
    }
    return employeeRepository.create(input);
  }

  async update(input: UpdateEmployeeInput) {
    const existing = await employeeRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Employee', input.id);
    await employeeRepository.update(input);
  }

  async delete(id: string, deletedBy: string) {
    const existing = await employeeRepository.findById(id);
    if (!existing) throw new NotFoundError('Employee', id);
    await employeeRepository.softDelete(id, deletedBy);
  }

  async uploadPhoto(employeeId: string, file: Express.Multer.File, uploadedBy: string) {
    return documentsService.upload({
      file,
      entityType: 'employee',
      entityId: employeeId,
      documentType: DocumentType.ProfilePhoto,
      createdBy: uploadedBy,
    });
  }
}

export const employeeService = new EmployeeService();
