import { employeeRepository } from './employee.repository';
import {
  BulkImportRow,
  CreateEmployeeInput,
  EmployeeFilter,
  MarkLeftInput,
  RejoinEmployeeInput,
  SaveEmployeeDraftInput,
  UpdateEmployeeInput,
} from './employee.types';
import { AppError, NotFoundError } from '../../common/errors';
import { assertOrgHierarchyForClient } from '../../utils/organization';
import { EmployeeLifecycleStatus } from './employee.constants';
import { siteRepository } from '../site/site.repository';

export class EmployeeService {
  private async validateClientSite(clientId?: string, siteId?: string): Promise<void> {
    if (!siteId) return;
    const siteClientId = await siteRepository.getClientIdForSite(siteId);
    if (!siteClientId) throw new NotFoundError('Site', siteId);
    if (clientId && clientId !== siteClientId) {
      throw new AppError(400, 'Selected site does not belong to the selected client.');
    }
  }

  private async validateEmployeeOrg(input: SaveEmployeeDraftInput): Promise<void> {
    if (!input.clientId || !input.departmentId?.trim() || !input.designationId?.trim()) return;
    await assertOrgHierarchyForClient({
      clientId: input.clientId,
      departmentId: input.departmentId.trim(),
      designationId: input.designationId.trim(),
      designationGradeId: input.designationGradeId,
    });
  }
  getAll(filter: EmployeeFilter) {
    return employeeRepository.findAll(filter);
  }

  async getById(id: string) {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw new NotFoundError('Employee', id);
    return employee;
  }

  getDashboardStats() {
    return employeeRepository.getDashboardStats();
  }

  getRecentEmployees(limit: number) {
    return employeeRepository.getRecentEmployees(limit);
  }

  getRecentActivities(limit: number) {
    return employeeRepository.getRecentActivities(limit);
  }

  generateEmployeeCode() {
    return employeeRepository.getNextEmployeeCode().then((code) => ({ code }));
  }

  async create(input: CreateEmployeeInput) {
    if (await employeeRepository.emailExists(input.email)) {
      throw new AppError(400, `An employee with email '${input.email}' already exists.`);
    }
    await this.validateClientSite(input.clientId, input.siteId);
    await this.validateEmployeeOrg(input);
    return employeeRepository.create(input);
  }

  async saveDraft(input: SaveEmployeeDraftInput) {
    if (input.email && (await employeeRepository.emailExists(input.email, input.id))) {
      throw new AppError(400, `An employee with email '${input.email}' already exists.`);
    }
    await this.validateClientSite(input.clientId, input.siteId);
    await this.validateEmployeeOrg(input);

    try {
      return await employeeRepository.saveDraft(input);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        throw new NotFoundError('Employee', input.id);
      }
      throw error;
    }
  }

  async submit(id: string, submittedBy: string) {
    try {
      return await employeeRepository.submit(id, submittedBy);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        throw new NotFoundError('Employee', id);
      }
      if (error instanceof Error && error.message === 'INCOMPLETE') {
        throw new AppError(400, 'Employee profile is incomplete. Complete all required steps before submitting.');
      }
      throw error;
    }
  }

  async update(input: UpdateEmployeeInput) {
    const existing = await employeeRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Employee', input.id);

    if (input.email && (await employeeRepository.emailExists(input.email, input.id))) {
      throw new AppError(400, `An employee with email '${input.email}' already exists.`);
    }
    await this.validateClientSite(input.clientId, input.siteId);
    await this.validateEmployeeOrg(input);

    try {
      await employeeRepository.update(input);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        throw new NotFoundError('Employee', input.id);
      }
      throw error;
    }
  }

  async markLeft(input: MarkLeftInput) {
    const existing = await employeeRepository.findById(input.employeeId);
    if (!existing) throw new NotFoundError('Employee', input.employeeId);

    if (
      existing.status !== EmployeeLifecycleStatus.Active
      && existing.status !== EmployeeLifecycleStatus.Rejoined
    ) {
      throw new AppError(400, 'Only active or rejoined employees can be marked as left.');
    }

    try {
      await employeeRepository.markLeft(input);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        throw new NotFoundError('Employee', input.employeeId);
      }
      throw error;
    }
  }

  async rejoin(input: RejoinEmployeeInput) {
    const existing = await employeeRepository.findById(input.employeeId);
    if (!existing) throw new NotFoundError('Employee', input.employeeId);

    if (existing.status !== EmployeeLifecycleStatus.Left) {
      throw new AppError(400, 'Only employees marked as left can be rejoined.');
    }

    await this.validateClientSite(undefined, input.siteId);

    try {
      await employeeRepository.rejoin(input);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        throw new NotFoundError('Employee', input.employeeId);
      }
      throw error;
    }
  }

  async uploadPhoto(employeeId: string, file: Express.Multer.File, uploadedBy: string) {
    await this.getById(employeeId);
    const relativePath = `employees/${file.filename}`;
    return employeeRepository.updatePhoto(employeeId, relativePath, uploadedBy);
  }

  async getProfile(id: string) {
    const profile = await employeeRepository.getProfile(id);
    if (!profile) throw new NotFoundError('Employee', id);
    return profile;
  }

  getTimeline(id: string) {
    return employeeRepository.getTimeline(id);
  }

  getHistory(id: string) {
    return employeeRepository.getHistory(id);
  }

  async getDocuments(id: string) {
    await this.getById(id);
    return employeeRepository.getDocuments(id);
  }

  async uploadDocument(
    employeeId: string,
    type: string,
    label: string,
    file: Express.Multer.File,
    uploadedBy: string,
  ) {
    await this.getById(employeeId);
    return employeeRepository.uploadDocument(employeeId, type, label, file, uploadedBy);
  }

  async deleteDocument(employeeId: string, documentId: string, deletedBy: string) {
    try {
      await employeeRepository.deleteDocument(employeeId, documentId, deletedBy);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') {
        throw new NotFoundError('Document', documentId);
      }
      throw error;
    }
  }

  async downloadDocument(employeeId: string, documentId: string) {
    const file = await employeeRepository.getDocumentFilePath(employeeId, documentId);
    if (!file || !employeeRepository.documentExistsOnDisk(file.filePath)) {
      throw new NotFoundError('Document', documentId);
    }
    return file;
  }

  bulkImport(rows: BulkImportRow[], createdBy: string) {
    return employeeRepository.bulkImport(rows, createdBy);
  }

  exportEmployees() {
    return employeeRepository.exportEmployees();
  }
}

export const employeeService = new EmployeeService();
