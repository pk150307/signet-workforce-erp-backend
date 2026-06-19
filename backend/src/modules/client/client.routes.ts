import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendCreated, sendNoContent, sendSuccess, validate } from '../../common/response';
import { createPaginatedResult } from '../../types';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 20;
      const conditions = ['NOT c.is_deleted'];
      const params: unknown[] = [];
      let i = 1;

      if (req.query.search) {
        conditions.push(`(LOWER(c.company_name) LIKE $${i} OR LOWER(c.client_code) LIKE $${i})`);
        params.push(`%${String(req.query.search).toLowerCase()}%`);
        i++;
      }

      const where = conditions.join(' AND ');
      const count = await dbQuery<{ count: string }>(
        `SELECT COUNT(*) AS count FROM clients c WHERE ${where}`,
        params,
      );

      const { rows } = await dbQuery<Record<string, unknown>>(
        `SELECT c.id, c.client_code, c.company_name, c.contact_person, c.email, c.phone,
                c.city, c.state, c.is_active,
                (SELECT COUNT(*) FROM sites s WHERE s.client_id = c.id AND NOT s.is_deleted) AS total_sites
         FROM clients c WHERE ${where}
         ORDER BY c.company_name LIMIT $${i} OFFSET $${i + 1}`,
        [...params, pageSize, (page - 1) * pageSize],
      );

      const items = rows.map((r) => ({
        id: String(r.id),
        clientCode: String(r.client_code),
        companyName: String(r.company_name),
        contactPerson: String(r.contact_person),
        email: String(r.email),
        phone: String(r.phone),
        city: String(r.city),
        state: String(r.state),
        isActive: Boolean(r.is_active),
        totalSites: parseInt(String(r.total_sites), 10),
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
  '/',
  validate([
    body('companyName').notEmpty(),
    body('contactPerson').notEmpty(),
    body('email').isEmail(),
    body('phone').notEmpty(),
    body('address').notEmpty(),
    body('city').notEmpty(),
    body('state').notEmpty(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const countResult = await dbQuery<{ count: string }>('SELECT COUNT(*) AS count FROM clients');
      const clientCode = `CLT-${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(4, '0')}`;

      const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO clients (
          client_code, company_name, contact_person, email, phone, gst_number,
          address, city, state, pin_code, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          clientCode,
          req.body.companyName,
          req.body.contactPerson,
          req.body.email,
          req.body.phone,
          req.body.gstNumber ?? null,
          req.body.address,
          req.body.city,
          req.body.state,
          req.body.pinCode ?? '',
          req.user?.username ?? 'System',
        ],
      );

      sendCreated(res, { id: rows[0].id });
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  '/:id',
  validate([param('id').isUUID()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await dbQuery(
        `UPDATE clients SET company_name = $2, contact_person = $3, email = $4, phone = $5,
         gst_number = $6, address = $7, city = $8, state = $9, pin_code = $10,
         updated_at = NOW(), updated_by = $11
         WHERE id = $1 AND NOT is_deleted`,
        [
          req.params.id,
          req.body.companyName,
          req.body.contactPerson,
          req.body.email,
          req.body.phone,
          req.body.gstNumber ?? null,
          req.body.address,
          req.body.city,
          req.body.state,
          req.body.pinCode ?? '',
          req.user?.username ?? 'System',
        ],
      );
      sendNoContent(res);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
