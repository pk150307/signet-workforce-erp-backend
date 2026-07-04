import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendId, sendSuccess, validate } from '../../common/response';
import {
  parseCursorPaginationQuery,
  pageSizeQueryValidator,
  parsePageSize,
  runCursorList,
} from '../../types';
import { InvoiceStatus } from '../../types/enums';
import { formatDate, toNumber } from '../../utils/formatters';
import { nextInvoiceNumber } from '../../utils/next-code';
import { billingService } from './billing.service';
import { renderInvoiceHtml } from './billing.print';
import { paramId } from '../../utils/request';
import billingConfigurationRoutes from './billing-configuration.routes';
import billingEngineRoutes from './billing-engine.routes';
import { billingEngineService } from './billing-engine.service';
import { billingInvoiceService } from './billing-invoice.service';
import { billingInvoicePrintService } from './billing-invoice-print.service';
import invoicePaymentRoutes from './invoice-payment.routes';
import { invoicePaymentService } from './invoice-payment.service';
import { PAYMENT_MODES } from './invoice-payment.types';
import billingReportsRoutes from './billing-reports.routes';
import invoiceAuditRoutes from './invoice-audit.routes';
import { invoiceAuditService } from './invoice-audit.service';

const router = Router();
router.use(authenticate);

router.use('/configurations', billingConfigurationRoutes);
router.use('/engine', billingEngineRoutes);
router.use('/payments', invoicePaymentRoutes);
router.use('/reports', billingReportsRoutes);
router.use('/audit-logs', invoiceAuditRoutes);

router.get(
  '/invoices',
  validate([
    pageSizeQueryValidator,
    query('cursor').optional().isString().trim(),
    query('direction').optional().isIn(['next', 'prev']),
    query('clientId').optional().isUUID(),
    query('status').optional().isInt({ min: 1, max: 10 }).toInt(),
    query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
    query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
    query('search').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = parseCursorPaginationQuery({
        pageSize: parsePageSize(req.query.pageSize),
        cursor: req.query.cursor as string | undefined,
        direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
      });
      const conditions = ['NOT i.is_deleted'];
      const params: unknown[] = [];
      let i = 1;

      if (req.query.clientId) {
        conditions.push(`i.client_id = $${i++}::uuid`);
        params.push(req.query.clientId);
      }
      if (req.query.status) {
        conditions.push(`i.status = $${i++}`);
        params.push(Number(req.query.status));
      }
      if (req.query.month) {
        conditions.push(`i.month = $${i++}`);
        params.push(Number(req.query.month));
      }
      if (req.query.year) {
        conditions.push(`i.year = $${i++}`);
        params.push(Number(req.query.year));
      }
      if (req.query.search) {
        conditions.push(`(LOWER(i.invoice_number) LIKE $${i} OR LOWER(c.company_name) LIKE $${i})`);
        params.push(`%${String(req.query.search).toLowerCase()}%`);
        i++;
      }

      const result = await runCursorList({
        queryFn: dbQuery,
        pagination,
        conditions,
        params,
        selectSql: `SELECT i.id, i.invoice_number, c.company_name AS client_name, i.invoice_date,
                i.due_date, i.sub_total, i.gst_amount, i.total_amount, i.paid_amount,
                i.status, s.site_name, i.month, i.year
         FROM invoices i
         INNER JOIN clients c ON c.id = i.client_id
         LEFT JOIN sites s ON s.id = i.site_id`,
        sortFields: [
          { column: 'i.invoice_date', key: 'invoiceDate', direction: 'DESC' },
          { column: 'i.id', key: 'id', direction: 'DESC' },
        ],
        mapRow: (r) => ({
          id: String(r.id),
          invoiceNumber: String(r.invoice_number),
          clientName: String(r.client_name),
          invoiceDate: formatDate(r.invoice_date as Date | string),
          dueDate: formatDate(r.due_date as Date | string),
          subTotal: toNumber(r.sub_total as string),
          gstAmount: toNumber(r.gst_amount as string),
          totalAmount: toNumber(r.total_amount as string),
          paidAmount: toNumber(r.paid_amount as string),
          balanceAmount: toNumber(r.total_amount as string) - toNumber(r.paid_amount as string),
          status: Number(r.status) as InvoiceStatus,
          siteName: r.site_name ? String(r.site_name) : null,
          month: Number(r.month),
          year: Number(r.year),
        }),
      });

      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invoices',
  validate([
    body('clientId').isUUID(),
    body('siteId').optional().isUUID(),
    body('invoiceDate').isISO8601(),
    body('dueDate').isISO8601(),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
    body('gstRate').isFloat({ min: 0, max: 28 }),
    body('lineItems').isArray({ min: 1 }),
    body('lineItems.*.description').notEmpty(),
    body('lineItems.*.quantity').isInt({ min: 1 }),
    body('lineItems.*.unitRate').isFloat({ min: 0 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const month = Number(req.body.month);
      const year = Number(req.body.year);
      const invoiceNumber = await nextInvoiceNumber(year, month);

      const lineItems = req.body.lineItems as Array<{
        description: string;
        quantity: number;
        unitRate: number;
        hsnSacCode?: string;
      }>;

      const subTotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitRate, 0);
      const gstAmount = subTotal * (req.body.gstRate / 100);
      const totalAmount = subTotal + gstAmount;

      const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO invoices (
          invoice_number, client_id, site_id, invoice_date, due_date, month, year,
          sub_total, gst_rate, gst_amount, total_amount, paid_amount, status,
          notes, terms_and_conditions, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15) RETURNING id`,
        [
          invoiceNumber,
          req.body.clientId,
          req.body.siteId ?? null,
          req.body.invoiceDate,
          req.body.dueDate,
          req.body.month,
          req.body.year,
          subTotal,
          req.body.gstRate,
          gstAmount,
          totalAmount,
          InvoiceStatus.Draft,
          req.body.notes ?? null,
          req.body.termsAndConditions ?? null,
          req.user?.username ?? 'System',
        ],
      );

      let sortOrder = 1;
      for (const item of lineItems) {
        await dbQuery(
          `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_rate, hsn_sac_code, sort_order, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            rows[0].id,
            item.description,
            item.quantity,
            item.unitRate,
            item.hsnSacCode ?? null,
            sortOrder++,
            req.user?.username ?? 'System',
          ],
        );
      }

      sendId(res, rows[0].id);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/suggested-line-items',
  validate([
    query('clientId').isUUID(),
    query('siteId').isUUID(),
    query('month').isInt({ min: 1, max: 12 }).toInt(),
    query('year').isInt({ min: 2000, max: 2100 }).toInt(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.getSuggestedLineItems(
        String(req.query.clientId),
        String(req.query.siteId),
        Number(req.query.month),
        Number(req.query.year),
      );
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invoices/generate-by-sites',
  validate([
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
    body('siteId').optional().isUUID(),
    body('siteIds').optional().isArray(),
    body('siteIds.*').optional().isUUID(),
    body('gstRate').optional().isFloat({ min: 0, max: 28 }),
    body('dueDateDays').optional().isInt({ min: 1, max: 90 }),
    body('notes').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.generateInvoicesBySites({
        month: Number(req.body.month),
        year: Number(req.body.year),
        siteId: req.body.siteId,
        siteIds: req.body.siteIds,
        gstRate: req.body.gstRate,
        dueDateDays: req.body.dueDateDays,
        notes: req.body.notes,
        createdBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invoices/preview',
  validate([
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
    body('clientId').isUUID(),
    body('siteId').isUUID(),
    body('skipValidation').optional().isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingEngineService.calculate({
        month: Number(req.body.month),
        year: Number(req.body.year),
        clientId: String(req.body.clientId),
        siteId: String(req.body.siteId),
        skipValidation: true,
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/preview-for-site',
  validate([
    query('siteId').isUUID(),
    query('month').isInt({ min: 1, max: 12 }).toInt(),
    query('year').isInt({ min: 2000, max: 2100 }).toInt(),
    query('gstRate').optional().isFloat({ min: 0, max: 28 }).toFloat(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.previewSiteInvoice(
        String(req.query.siteId),
        Number(req.query.month),
        Number(req.query.year),
        req.query.gstRate ? Number(req.query.gstRate) : 18,
      );
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invoices/generate',
  validate([
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
    body('clientId').isUUID(),
    body('siteId').isUUID(),
    body('notes').optional().isString(),
    body('termsAndConditions').optional().isString(),
    body('invoiceDate').optional().isISO8601(),
    body('dueDate').optional().isISO8601(),
    body('skipValidation').optional().isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingInvoiceService.generate({
        month: Number(req.body.month),
        year: Number(req.body.year),
        clientId: String(req.body.clientId),
        siteId: String(req.body.siteId),
        notes: req.body.notes,
        termsAndConditions: req.body.termsAndConditions,
        invoiceDate: req.body.invoiceDate,
        dueDate: req.body.dueDate,
        skipValidation: req.body.skipValidation ?? false,
        createdBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result, 201);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invoices/generate-for-site',
  validate([
    body('siteId').isUUID(),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
    body('gstRate').optional().isFloat({ min: 0, max: 28 }),
    body('dueDateDays').optional().isInt({ min: 1, max: 90 }),
    body('notes').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.generateInvoiceForSite({
        siteId: req.body.siteId,
        month: Number(req.body.month),
        year: Number(req.body.year),
        gstRate: req.body.gstRate,
        dueDateDays: req.body.dueDateDays,
        notes: req.body.notes,
        createdBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/by-site/:siteId',
  validate([
    param('siteId').isUUID(),
    pageSizeQueryValidator,
    query('cursor').optional().isString().trim(),
    query('direction').optional().isIn(['next', 'prev']),
    query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
    query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.getInvoicesBySite(paramId(req, 'siteId'), {
        pageSize: parsePageSize(req.query.pageSize),
        cursor: req.query.cursor as string | undefined,
        direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
        month: req.query.month ? Number(req.query.month) : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invoices/site/:siteId',
  validate([
    param('siteId').isUUID(),
    body('invoiceDate').isISO8601(),
    body('dueDate').isISO8601(),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
    body('gstRate').isFloat({ min: 0, max: 28 }),
    body('lineItems').isArray({ min: 1 }),
    body('lineItems.*.description').notEmpty(),
    body('lineItems.*.quantity').isInt({ min: 1 }),
    body('lineItems.*.unitRate').isFloat({ min: 0 }),
    body('lineItems.*.hsnSacCode').optional().isString(),
    body('notes').optional().isString(),
    body('termsAndConditions').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.createSiteInvoice({
        siteId: paramId(req, 'siteId'),
        month: Number(req.body.month),
        year: Number(req.body.year),
        invoiceDate: req.body.invoiceDate,
        dueDate: req.body.dueDate,
        gstRate: Number(req.body.gstRate),
        lineItems: req.body.lineItems,
        notes: req.body.notes,
        termsAndConditions: req.body.termsAndConditions,
        createdBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/:invoiceId/activity',
  validate([
    param('invoiceId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoiceAuditService.getActivity(
        paramId(req, 'invoiceId'),
        req.query.limit ? Number(req.query.limit) : 100,
      );
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/:invoiceId/history',
  validate([param('invoiceId').isUUID()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoiceAuditService.getHistory(paramId(req, 'invoiceId'));
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/:invoiceId/audit-logs',
  validate([
    param('invoiceId').isUUID(),
    pageSizeQueryValidator,
    query('cursor').optional().isString().trim(),
    query('direction').optional().isIn(['next', 'prev']),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoiceAuditService.listByInvoice(paramId(req, 'invoiceId'), {
        pageSize: parsePageSize(req.query.pageSize),
        cursor: req.query.cursor as string | undefined,
        direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/:invoiceId/payments/summary',
  validate([param('invoiceId').isUUID()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoicePaymentService.getSummary(paramId(req, 'invoiceId'));
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  '/invoices/:invoiceId/payments',
  validate([param('invoiceId').isUUID()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoicePaymentService.listByInvoice(paramId(req, 'invoiceId'));
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/invoices/:invoiceId/payments',
  validate([
    param('invoiceId').isUUID(),
    body('paymentDate').isISO8601(),
    body('amount').isFloat({ min: 0.01 }),
    body('referenceNumber').optional({ nullable: true }).isString(),
    body('utrNumber').optional({ nullable: true }).isString(),
    body('paymentMode').optional().isIn(PAYMENT_MODES),
    body('remarks').optional({ nullable: true }).isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await invoicePaymentService.recordPayment(paramId(req, 'invoiceId'), {
        paymentDate: req.body.paymentDate,
        amount: Number(req.body.amount),
        referenceNumber: req.body.referenceNumber,
        utrNumber: req.body.utrNumber,
        paymentMode: req.body.paymentMode,
        remarks: req.body.remarks,
        createdBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result, 201);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/invoices/:id', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await billingService.getInvoiceById(paramId(req));
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

router.put(
  '/invoices/:id',
  validate([
    param('id').isUUID(),
    body('invoiceDate').optional().isISO8601(),
    body('dueDate').optional().isISO8601(),
    body('gstRate').optional().isFloat({ min: 0, max: 28 }),
    body('lineItems').optional().isArray({ min: 1 }),
    body('lineItems.*.description').optional().notEmpty(),
    body('lineItems.*.quantity').optional().isFloat({ min: 0.01 }),
    body('lineItems.*.unitRate').optional().isFloat({ min: 0 }),
    body('notes').optional().isString(),
    body('termsAndConditions').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.updateInvoice(paramId(req), {
        invoiceDate: req.body.invoiceDate,
        dueDate: req.body.dueDate,
        gstRate: req.body.gstRate,
        notes: req.body.notes,
        termsAndConditions: req.body.termsAndConditions,
        lineItems: req.body.lineItems,
        updatedBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.delete('/invoices/:id', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await billingService.deleteInvoice(paramId(req), req.user?.username ?? 'System');
    sendSuccess(res, { deleted: true });
  } catch (e) {
    next(e);
  }
});

router.patch(
  '/invoices/:id/status',
  validate([
    param('id').isUUID(),
    body('status').isInt({ min: 1, max: 10 }),
    body('paidAmount').optional().isFloat({ min: 0 }),
    body('note').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.updateInvoiceStatus(paramId(req), {
        status: Number(req.body.status),
        paidAmount: req.body.paidAmount,
        note: req.body.note,
        updatedBy: req.user?.username ?? 'System',
      });
      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.get('/invoices/:id/preview', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await billingInvoicePrintService.getInvoiceForPrint(paramId(req));
    if (req.query.format === 'html') {
      const html = renderInvoiceHtml(invoice);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      return;
    }
    sendSuccess(res, invoice);
  } catch (e) {
    next(e);
  }
});

router.get('/invoices/:id/pdf', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await billingInvoicePrintService.getInvoiceForPrint(paramId(req));
    const html = renderInvoiceHtml(invoice);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.html"`);
    res.send(html);
  } catch (e) {
    next(e);
  }
});

router.get('/invoices/:id/print', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await billingInvoicePrintService.getInvoiceForPrint(paramId(req));
    const html = renderInvoiceHtml(invoice);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

router.post('/invoices/:id/email', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await billingService.getInvoiceById(paramId(req));
    if (invoice.status === InvoiceStatus.Draft) {
      await billingService.updateInvoiceStatus(paramId(req), {
        status: InvoiceStatus.Sent,
        note: 'Invoice emailed to client',
        updatedBy: req.user?.username ?? 'System',
      });
    }
    sendSuccess(res, { queued: true, invoiceNumber: invoice.invoiceNumber });
  } catch (e) {
    next(e);
  }
});

export default router;
