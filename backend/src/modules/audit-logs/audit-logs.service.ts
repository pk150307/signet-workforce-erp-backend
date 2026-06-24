import { NotFoundError } from '../../common/errors';
import { auditLogsRepository } from './audit-logs.repository';
import { AuditLogFilter } from './audit-logs.types';

export class AuditLogsService {
  list(filter: AuditLogFilter) {
    return auditLogsRepository.findAll(filter);
  }

  async getById(id: string) {
    const item = await auditLogsRepository.findById(id);
    if (!item) throw new NotFoundError('Audit log', id);
    return item;
  }

  getSummary(filter: Pick<AuditLogFilter, 'dateFrom' | 'dateTo' | 'module' | 'userId'>) {
    return auditLogsRepository.getSummary(filter);
  }

  export(filter: AuditLogFilter) {
    return auditLogsRepository.exportCsv(filter);
  }
}

export const auditLogsService = new AuditLogsService();
