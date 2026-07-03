import { withTransaction } from '../../database/pool';
import { AppError, NotFoundError } from '../../common/errors';
import { InvoiceStatus } from '../../types/enums';
import { round2 } from '../../utils/formatters';
import { invoicePaymentRepository } from './invoice-payment.repository';
import {
  InvoicePaymentFilter,
  InvoicePaymentSummaryDto,
  RecordInvoicePaymentInput,
  UpdateInvoicePaymentInput,
} from './invoice-payment.types';

const STATUS_LABELS: Record<number, string> = {
  [InvoiceStatus.Draft]: 'Draft',
  [InvoiceStatus.Sent]: 'Sent',
  [InvoiceStatus.Viewed]: 'Viewed',
  [InvoiceStatus.PartiallyPaid]: 'Partially Paid',
  [InvoiceStatus.Paid]: 'Paid',
  [InvoiceStatus.Overdue]: 'Overdue',
  [InvoiceStatus.Cancelled]: 'Cancelled',
  [InvoiceStatus.Generated]: 'Generated',
  [InvoiceStatus.Approved]: 'Approved',
  [InvoiceStatus.Archived]: 'Archived',
};

const PAYMENT_BLOCKED_STATUSES = new Set([
  InvoiceStatus.Draft,
  InvoiceStatus.Cancelled,
  InvoiceStatus.Archived,
]);

export class InvoicePaymentService {
  list(filter: InvoicePaymentFilter) {
    return invoicePaymentRepository.findAll(filter);
  }

  listByInvoice(invoiceId: string) {
    return invoicePaymentRepository.findByInvoiceId(invoiceId);
  }

  async getById(id: string) {
    const payment = await invoicePaymentRepository.findById(id);
    if (!payment) throw new NotFoundError('Invoice payment', id);
    return payment;
  }

  async getSummary(invoiceId: string): Promise<InvoicePaymentSummaryDto> {
    const invoice = await invoicePaymentRepository.getInvoiceContext(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    const paymentCount = await invoicePaymentRepository.paymentCount(invoiceId);
    const paidAmount = await invoicePaymentRepository.sumPayments(invoiceId);

    return this.buildSummary(invoice, paidAmount, paymentCount, invoice.status);
  }

  private buildSummary(
    invoice: { id: string; invoiceNumber: string; totalAmount: number; status: number },
    paidAmount: number,
    paymentCount: number,
    status: number,
  ): InvoicePaymentSummaryDto {
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      paidAmount: round2(paidAmount),
      balanceAmount: round2(invoice.totalAmount - paidAmount),
      paymentCount,
      status,
      statusLabel: STATUS_LABELS[status] ?? 'Unknown',
    };
  }

  async recordPayment(invoiceId: string, input: RecordInvoicePaymentInput) {
    return withTransaction(async (client) => {
      const invoice = await invoicePaymentRepository.getInvoiceContext(invoiceId, client);
      if (!invoice) throw new NotFoundError('Invoice', invoiceId);

      this.assertPayable(invoice.status);

      const currentPaid = await invoicePaymentRepository.sumPayments(invoiceId, client);
      const balance = round2(invoice.totalAmount - currentPaid);

      if (input.amount <= 0) {
        throw new AppError(400, 'Payment amount must be greater than zero.');
      }
      if (input.amount > balance) {
        throw new AppError(
          400,
          `Payment amount exceeds outstanding balance of ₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
        );
      }

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO invoice_payments (
          invoice_id, payment_date, amount, reference_number, utr_number,
          payment_mode, remarks, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id`,
        [
          invoiceId,
          input.paymentDate,
          input.amount,
          input.referenceNumber ?? null,
          input.utrNumber ?? null,
          input.paymentMode ?? 'neft',
          input.remarks ?? null,
          input.createdBy,
        ],
      );

      const newPaid = round2(currentPaid + input.amount);
      const newStatus = this.deriveStatus(invoice.status, newPaid, invoice.totalAmount, invoice.dueDate, invoice.isLocked);

      await invoicePaymentRepository.syncInvoicePaidAmount(
        invoiceId,
        newPaid,
        newStatus,
        input.createdBy,
        client,
      );

      if (newStatus !== invoice.status) {
        await invoicePaymentRepository.logStatusEvent(
          invoiceId,
          invoice.status,
          newStatus,
          `Payment of ₹${input.amount} recorded`,
          input.createdBy,
          client,
        );
      }

      await invoicePaymentRepository.logAudit(
        invoiceId,
        'payment_recorded',
        { paidAmount: currentPaid, status: invoice.status },
        {
          paymentId: rows[0].id,
          amount: input.amount,
          paymentMode: input.paymentMode ?? 'neft',
          paidAmount: newPaid,
          status: newStatus,
        },
        input.createdBy,
        client,
      );

      const payment = await invoicePaymentRepository.findById(rows[0].id, client);
      if (!payment) throw new AppError(500, 'Payment recorded but could not be loaded.');

      const paymentCount = await invoicePaymentRepository.paymentCount(invoiceId, client);

      return {
        payment,
        summary: this.buildSummary(invoice, newPaid, paymentCount, newStatus),
      };
    });
  }

  async updatePayment(id: string, input: UpdateInvoicePaymentInput) {
    return withTransaction(async (client) => {
      const existing = await invoicePaymentRepository.findById(id, client);
      if (!existing) throw new NotFoundError('Invoice payment', id);

      const invoice = await invoicePaymentRepository.getInvoiceContext(existing.invoiceId, client);
      if (!invoice) throw new NotFoundError('Invoice', existing.invoiceId);

      this.assertPayable(invoice.status);

      const otherPaid = round2(
        (await invoicePaymentRepository.sumPayments(existing.invoiceId, client)) - existing.amount,
      );
      const newAmount = input.amount ?? existing.amount;

      if (newAmount <= 0) {
        throw new AppError(400, 'Payment amount must be greater than zero.');
      }

      const balance = round2(invoice.totalAmount - otherPaid);
      if (newAmount > balance) {
        throw new AppError(400, `Updated payment amount exceeds outstanding balance of ₹${balance.toLocaleString('en-IN')}.`);
      }

      const updated = await invoicePaymentRepository.updatePayment(id, input, client);
      if (!updated) throw new NotFoundError('Invoice payment', id);

      const newPaid = round2(otherPaid + newAmount);
      const newStatus = this.deriveStatus(invoice.status, newPaid, invoice.totalAmount, invoice.dueDate, invoice.isLocked);

      await invoicePaymentRepository.syncInvoicePaidAmount(
        existing.invoiceId,
        newPaid,
        newStatus,
        input.updatedBy,
        client,
      );

      if (newStatus !== invoice.status) {
        await invoicePaymentRepository.logStatusEvent(
          existing.invoiceId,
          invoice.status,
          newStatus,
          `Payment updated to ₹${newAmount}`,
          input.updatedBy,
          client,
        );
      }

      await invoicePaymentRepository.logAudit(
        existing.invoiceId,
        'payment_updated',
        { paymentId: id, amount: existing.amount, paidAmount: invoice.paidAmount },
        { paymentId: id, amount: newAmount, paidAmount: newPaid, status: newStatus },
        input.updatedBy,
        client,
      );

      const paymentCount = await invoicePaymentRepository.paymentCount(existing.invoiceId, client);

      return {
        payment: updated,
        summary: this.buildSummary(invoice, newPaid, paymentCount, newStatus),
      };
    });
  }

  async deletePayment(id: string, deletedBy: string) {
    return withTransaction(async (client) => {
      const existing = await invoicePaymentRepository.findById(id, client);
      if (!existing) throw new NotFoundError('Invoice payment', id);

      const invoice = await invoicePaymentRepository.getInvoiceContext(existing.invoiceId, client);
      if (!invoice) throw new NotFoundError('Invoice', existing.invoiceId);

      const deleted = await invoicePaymentRepository.softDelete(id, deletedBy, client);
      if (!deleted) throw new NotFoundError('Invoice payment', id);

      const newPaid = round2(
        (await invoicePaymentRepository.sumPayments(existing.invoiceId, client)),
      );
      const newStatus = this.deriveStatus(invoice.status, newPaid, invoice.totalAmount, invoice.dueDate, invoice.isLocked);

      await invoicePaymentRepository.syncInvoicePaidAmount(
        existing.invoiceId,
        newPaid,
        newStatus,
        deletedBy,
        client,
      );

      if (newStatus !== invoice.status) {
        await invoicePaymentRepository.logStatusEvent(
          existing.invoiceId,
          invoice.status,
          newStatus,
          `Payment of ₹${existing.amount} removed`,
          deletedBy,
          client,
        );
      }

      await invoicePaymentRepository.logAudit(
        existing.invoiceId,
        'payment_deleted',
        { paymentId: id, amount: existing.amount, paidAmount: invoice.paidAmount, status: invoice.status },
        { paidAmount: newPaid, status: newStatus },
        deletedBy,
        client,
      );

      const paymentCount = await invoicePaymentRepository.paymentCount(existing.invoiceId, client);

      return this.buildSummary(invoice, newPaid, paymentCount, newStatus);
    });
  }

  private assertPayable(status: number): void {
    if (PAYMENT_BLOCKED_STATUSES.has(status)) {
      throw new AppError(400, `Payments cannot be recorded for invoices in ${STATUS_LABELS[status] ?? 'this'} status.`);
    }
  }

  private deriveStatus(
    currentStatus: number,
    paidAmount: number,
    totalAmount: number,
    dueDate: string,
    isLocked: boolean,
  ): number {
    if (paidAmount >= totalAmount) return InvoiceStatus.Paid;
    if (paidAmount > 0) return InvoiceStatus.PartiallyPaid;

    if (currentStatus === InvoiceStatus.Paid || currentStatus === InvoiceStatus.PartiallyPaid) {
      if (isLocked) return InvoiceStatus.Approved;
      const today = new Date().toISOString().slice(0, 10);
      if (dueDate < today) return InvoiceStatus.Overdue;
      return InvoiceStatus.Sent;
    }

    return currentStatus;
  }
}

export const invoicePaymentService = new InvoicePaymentService();
