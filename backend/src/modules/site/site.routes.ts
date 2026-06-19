import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess, validate } from '../../common/response';
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
      const conditions = ['NOT s.is_deleted'];
      const params: unknown[] = [];
      let i = 1;

      if (req.query.search) {
        conditions.push(`(LOWER(s.site_name) LIKE $${i} OR LOWER(s.site_code) LIKE $${i})`);
        params.push(`%${String(req.query.search).toLowerCase()}%`);
        i++;
      }

      const where = conditions.join(' AND ');
      const count = await dbQuery<{ count: string }>(
        `SELECT COUNT(*) AS count FROM sites s WHERE ${where}`,
        params,
      );

      const { rows } = await dbQuery<Record<string, unknown>>(
        `SELECT s.id, s.site_code, s.site_name, c.company_name AS client_company_name,
                s.city, s.state, s.required_headcount, s.is_active
         FROM sites s
         INNER JOIN clients c ON c.id = s.client_id
         WHERE ${where}
         ORDER BY s.site_name LIMIT $${i} OFFSET $${i + 1}`,
        [...params, pageSize, (page - 1) * pageSize],
      );

      const items = rows.map((r) => ({
        id: String(r.id),
        siteCode: String(r.site_code),
        siteName: String(r.site_name),
        clientCompanyName: String(r.client_company_name),
        city: String(r.city),
        state: String(r.state),
        requiredHeadcount: Number(r.required_headcount),
        isActive: Boolean(r.is_active),
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

export default router;
