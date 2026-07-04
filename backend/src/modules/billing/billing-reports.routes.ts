import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { pageSizeQueryValidator, parsePageSize } from '../../types';
import { sendSuccess, validate } from '../../common/response';
import { PAYMENT_MODES } from './invoice-payment.types';
import { billingReportsService } from './billing-reports.service';

const router = Router();

const periodFilters = [
  query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
  query('clientId').optional().isUUID(),
  query('siteId').optional().isUUID(),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
];

router.get('/summary', validate(periodFilters), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await billingReportsService.getPeriodSummary({
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      clientId: req.query.clientId ? String(req.query.clientId) : undefined,
      siteId: req.query.siteId ? String(req.query.siteId) : undefined,
      fromDate: req.query.fromDate ? String(req.query.fromDate) : undefined,
      toDate: req.query.toDate ? String(req.query.toDate) : undefined,
    });
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

router.get(
  '/outstanding',
  validate([
    ...periodFilters,
    query('asOfDate').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    pageSizeQueryValidator,
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingReportsService.getOutstandingReport({
        month: req.query.month ? Number(req.query.month) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        clientId: req.query.clientId ? String(req.query.clientId) : undefined,
        siteId: req.query.siteId ? String(req.query.siteId) : undefined,
        asOfDate: req.query.asOfDate ? String(req.query.asOfDate) : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize != null && req.query.pageSize !== '' ? parsePageSize(req.query.pageSize) : undefined,
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/collections',
  validate([
    ...periodFilters,
    query('paymentMode').optional().isIn(PAYMENT_MODES),
    query('page').optional().isInt({ min: 1 }).toInt(),
    pageSizeQueryValidator,
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingReportsService.getCollectionsReport({
        month: req.query.month ? Number(req.query.month) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        clientId: req.query.clientId ? String(req.query.clientId) : undefined,
        siteId: req.query.siteId ? String(req.query.siteId) : undefined,
        fromDate: req.query.fromDate ? String(req.query.fromDate) : undefined,
        toDate: req.query.toDate ? String(req.query.toDate) : undefined,
        paymentMode: req.query.paymentMode ? String(req.query.paymentMode) : undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize != null && req.query.pageSize !== '' ? parsePageSize(req.query.pageSize) : undefined,
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/gst', validate(periodFilters), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await billingReportsService.getGstReport({
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      clientId: req.query.clientId ? String(req.query.clientId) : undefined,
      siteId: req.query.siteId ? String(req.query.siteId) : undefined,
      fromDate: req.query.fromDate ? String(req.query.fromDate) : undefined,
      toDate: req.query.toDate ? String(req.query.toDate) : undefined,
    });
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

export default router;
