import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { pageSizeQueryValidator, parsePageSize } from '../../types';
import { sendSuccess, validate } from '../../common/response';
import { paramId } from '../../utils/request';
import { PAYMENT_MODES } from './invoice-payment.types';
import { invoicePaymentService } from './invoice-payment.service';

const router = Router();

router.get(
  '/',
  validate([
    pageSizeQueryValidator,
    query('cursor').optional().isString().trim(),
    query('direction').optional().isIn(['next', 'prev']),
    query('invoiceId').optional().isUUID(),
    query('clientId').optional().isUUID(),
    query('paymentMode').optional().isIn(PAYMENT_MODES),
    query('fromDate').optional().isISO8601(),
    query('toDate').optional().isISO8601(),
    query('search').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoicePaymentService.list({
        pageSize: parsePageSize(req.query.pageSize),
        cursor: req.query.cursor as string | undefined,
        direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
        invoiceId: req.query.invoiceId ? String(req.query.invoiceId) : undefined,
        clientId: req.query.clientId ? String(req.query.clientId) : undefined,
        paymentMode: req.query.paymentMode as typeof PAYMENT_MODES[number] | undefined,
        fromDate: req.query.fromDate ? String(req.query.fromDate) : undefined,
        toDate: req.query.toDate ? String(req.query.toDate) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/:id', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await invoicePaymentService.getById(paramId(req));
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

router.put(
  '/:id',
  validate([
    param('id').isUUID(),
    body('paymentDate').optional().isISO8601(),
    body('amount').optional().isFloat({ min: 0.01 }),
    body('referenceNumber').optional({ nullable: true }).isString(),
    body('utrNumber').optional({ nullable: true }).isString(),
    body('paymentMode').optional().isIn(PAYMENT_MODES),
    body('remarks').optional({ nullable: true }).isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoicePaymentService.updatePayment(paramId(req), {
        paymentDate: req.body.paymentDate,
        amount: req.body.amount != null ? Number(req.body.amount) : undefined,
        referenceNumber: req.body.referenceNumber,
        utrNumber: req.body.utrNumber,
        paymentMode: req.body.paymentMode,
        remarks: req.body.remarks,
        updatedBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.delete('/:id', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await invoicePaymentService.deletePayment(paramId(req), req.user?.username ?? 'System');
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

export default router;
