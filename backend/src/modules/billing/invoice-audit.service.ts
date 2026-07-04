import { NotFoundError } from '../../common/errors';
import { invoiceAuditRepository } from './invoice-audit.repository';
import { InvoiceAuditFilter } from './invoice-audit.types';

export class InvoiceAuditService {
  list(filter: InvoiceAuditFilter) {
    return invoiceAuditRepository.findAll(filter);
  }

  async getById(id: string) {
    const log = await invoiceAuditRepository.findById(id);
    if (!log) throw new NotFoundError('Invoice audit log', id);
    return log;
  }

  listActions() {
    return invoiceAuditRepository.listActions();
  }

  async listByInvoice(
    invoiceId: string,
    filter: Pick<InvoiceAuditFilter, 'pageSize' | 'cursor' | 'direction' | 'page'>,
  ) {
    await this.assertInvoice(invoiceId);
    return invoiceAuditRepository.findByInvoiceId(invoiceId, filter);
  }

  async getHistory(invoiceId: string) {
    await this.assertInvoice(invoiceId);
    return invoiceAuditRepository.findHistoryByInvoiceId(invoiceId);
  }

  async getHistoryById(id: string) {
    const entry = await invoiceAuditRepository.findHistoryById(id);
    if (!entry) throw new NotFoundError('Invoice history', id);
    return entry;
  }

  async getActivity(invoiceId: string, limit?: number) {
    await this.assertInvoice(invoiceId);
    return invoiceAuditRepository.getActivityFeed(invoiceId, limit);
  }

  private async assertInvoice(invoiceId: string): Promise<void> {
    const exists = await invoiceAuditRepository.invoiceExists(invoiceId);
    if (!exists) throw new NotFoundError('Invoice', invoiceId);
  }
}

export const invoiceAuditService = new InvoiceAuditService();
