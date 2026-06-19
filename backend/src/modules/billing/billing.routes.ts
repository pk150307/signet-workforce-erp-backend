import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendId, sendSuccess, validate } from '../../common/response';
import { createPaginatedResult } from '../../types';
import { InvoiceStatus } from '../../types/enums';
import { formatDate, toNumber } from '../../utils/formatters';
import { billingService } from './billing.service';
import { paramId } from '../../utils/request';

const router = Router();
router.use(authenticate);

router.get(
  '/invoices',
  validate([
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('clientId').optional().isUUID(),
    query('status').optional().isInt({ min: 1, max: 7 }).toInt(),
    query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
    query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
    query('search').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 20;
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

      const where = conditions.join(' AND ');
      const count = await dbQuery<{ count: string }>(
        `SELECT COUNT(*) AS count FROM invoices i
         INNER JOIN clients c ON c.id = i.client_id WHERE ${where}`,
        params,
      );

      const { rows } = await dbQuery<Record<string, unknown>>(
        `SELECT i.id, i.invoice_number, c.company_name AS client_name, i.invoice_date,
                i.due_date, i.total_amount, i.paid_amount, i.status, s.site_name
         FROM invoices i
         INNER JOIN clients c ON c.id = i.client_id
         LEFT JOIN sites s ON s.id = i.site_id
         WHERE ${where}
         ORDER BY i.invoice_date DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, pageSize, (page - 1) * pageSize],
      );

      const items = rows.map((r) => ({
        id: String(r.id),
        invoiceNumber: String(r.invoice_number),
        clientName: String(r.client_name),
        invoiceDate: formatDate(String(r.invoice_date)),
        dueDate: formatDate(String(r.due_date)),
        totalAmount: toNumber(r.total_amount as string),
        paidAmount: toNumber(r.paid_amount as string),
        balanceAmount: toNumber(r.total_amount as string) - toNumber(r.paid_amount as string),
        status: Number(r.status) as InvoiceStatus,
        siteName: r.site_name ? String(r.site_name) : null,
      }));

      sendSuccess(
        res,
        createPaginatedResult(items, parseInt(count.rows[0].count, 10), page, pageSize),
      );
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
      const countResult = await dbQuery<{ count: string }>('SELECT COUNT(*) AS count FROM invoices');
      const invoiceNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(4, '0')}`;

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

router.post(
  '/invoices/generate-by-sites',
  validate([
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
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

router.get(
  '/invoices/by-site/:siteId',
  validate([
    param('siteId').isUUID(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
    query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await billingService.getInvoicesBySite(
        paramId(req, 'siteId'),
        Number(req.query.page) || 1,
        Number(req.query.pageSize) || 20,
        req.query.month ? Number(req.query.month) : undefined,
        req.query.year ? Number(req.query.year) : undefined,
      );
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

router.get('/invoices/:id', validate([param('id').isUUID()]), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await billingService.getInvoiceById(paramId(req));
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
});

export default router;
