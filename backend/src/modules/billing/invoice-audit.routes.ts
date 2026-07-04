import { Router, Request, Response, NextFunction } from 'express';
import { param, query } from 'express-validator';
import { sendSuccess, validate } from '../../common/response';
import { paramId } from '../../utils/request';
import { invoiceAuditService } from './invoice-audit.service';

const router = Router();

const listValidation = [
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('cursor').optional().isString().trim(),
  query('direction').optional().isIn(['next', 'prev']),
  query('invoiceId').optional().isUUID(),
  query('clientId').optional().isUUID(),
  query('action').optional().isString(),
  query('createdBy').optional().isString(),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
  query('search').optional().isString(),
];

router.get('/actions', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const actions = await invoiceAuditService.listActions();
    sendSuccess(res, actions);
  } catch (e) {
    next(e);
  }
});

router.get(
  '/history/:id',
  validate([param('id').isUUID()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoiceAuditService.getHistoryById(paramId(req));
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/', validate(listValidation), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await invoiceAuditService.list({
      pageSize: Number(req.query.pageSize) || 10,
      cursor: req.query.cursor as string | undefined,
      direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
      invoiceId: req.query.invoiceId ? String(req.query.invoiceId) : undefined,
      clientId: req.query.clientId ? String(req.query.clientId) : undefined,
      action: req.query.action ? String(req.query.action) : undefined,
      createdBy: req.query.createdBy ? String(req.query.createdBy) : undefined,
      fromDate: req.query.fromDate ? String(req.query.fromDate) : undefined,
      toDate: req.query.toDate ? String(req.query.toDate) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
    });
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await invoiceAuditService.getById(paramId(req));
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

export default router;
