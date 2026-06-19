import { statutoryRepository } from './statutory.repository';
import { StatutoryFilter, UpsertPfEsicInput } from './statutory.types';
import { NotFoundError } from '../../common/errors';

export class StatutoryService {
  list(filter: StatutoryFilter) {
    return statutoryRepository.findAll(filter);
  }

  async getByEmployeeId(employeeId: string) {
    const detail = await statutoryRepository.findByEmployeeId(employeeId);
    if (!detail) throw new NotFoundError('Employee', employeeId);
    return detail;
  }

  async upsert(input: UpsertPfEsicInput) {
    const exists = await statutoryRepository.employeeExists(input.employeeId);
    if (!exists) throw new NotFoundError('Employee', input.employeeId);
    await statutoryRepository.upsert(input);
    return statutoryRepository.findByEmployeeId(input.employeeId);
  }

  async bulkUpsert(items: UpsertPfEsicInput[]) {
    const results = [];
    for (const item of items) {
      const detail = await this.upsert(item);
      results.push(detail);
    }
    return results;
  }
}

export const statutoryService = new StatutoryService();
