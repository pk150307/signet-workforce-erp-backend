import { clientRepository } from '../client/client.repository';
import { departmentRepository } from '../department/department.repository';
import { designationRepository } from '../designation/designation.repository';
import { designationGradeRepository } from '../designation-grade/designation-grade.repository';
import { employeeRepository } from '../employee/employee.repository';
import { siteRepository } from '../site/site.repository';
import { IAM_MODULES } from '../iam/iam.constants';
import { deleteEntityKey } from './delete-requests.permissions';

export type DeleteExecutor = (entityId: string, deletedBy: string) => Promise<void>;

const executors = new Map<string, DeleteExecutor>();

function register(module: string, entityType: string, executor: DeleteExecutor): void {
  executors.set(deleteEntityKey(module, entityType), executor);
}

register(IAM_MODULES.CLIENTS, IAM_MODULES.CLIENTS, async (id, deletedBy) => {
  const deleted = await clientRepository.softDelete(id, deletedBy);
  if (!deleted) throw new Error(`Client ${id} not found or already deleted`);
});

register(IAM_MODULES.SITES, IAM_MODULES.SITES, async (id, deletedBy) => {
  const deleted = await siteRepository.softDelete(id, deletedBy);
  if (!deleted) throw new Error(`Site ${id} not found or already deleted`);
});

register(IAM_MODULES.EMPLOYEES, IAM_MODULES.EMPLOYEES, async (id, deletedBy) => {
  await employeeRepository.softDelete(id, deletedBy);
});

register(IAM_MODULES.SETTINGS, 'Departments', async (id, deletedBy) => {
  const deleted = await departmentRepository.softDelete(id, deletedBy);
  if (!deleted) throw new Error(`Department ${id} not found or already deleted`);
});

register(IAM_MODULES.SETTINGS, 'Designations', async (id, deletedBy) => {
  const deleted = await designationRepository.softDelete(id, deletedBy);
  if (!deleted) throw new Error(`Designation ${id} not found or already deleted`);
});

register(IAM_MODULES.SETTINGS, 'DesignationGrades', async (id, deletedBy) => {
  const deleted = await designationGradeRepository.softDelete(id, deletedBy);
  if (!deleted) throw new Error(`Designation grade ${id} not found or already deleted`);
});

export function getDeleteExecutor(module: string, entityType: string): DeleteExecutor | null {
  return executors.get(deleteEntityKey(module, entityType)) ?? null;
}

export function registerDeleteExecutor(
  module: string,
  entityType: string,
  executor: DeleteExecutor,
): void {
  register(module, entityType, executor);
}
