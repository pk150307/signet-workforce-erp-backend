import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendCreated, sendNoContent, sendSuccess, validate } from '../../common/response';
import { paramId } from '../../utils/request';
import { formatDate } from '../../utils/formatters';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('year').optional().isInt({ min: 2000, max: 2100 }),
    query('upcoming').optional().isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conditions = ['NOT is_deleted', 'is_active'];
      const params: unknown[] = [];
      let i = 1;

      if (req.query.year) {
        conditions.push(`EXTRACT(YEAR FROM holiday_date) = $${i++}`);
        params.push(Number(req.query.year));
      }
      if (req.query.upcoming === 'true') {
        conditions.push(`holiday_date >= CURRENT_DATE`);
      }

      const { rows } = await dbQuery<Record<string, unknown>>(
        `SELECT id, name, holiday_date, holiday_type, description, is_optional, is_active
         FROM holidays WHERE ${conditions.join(' AND ')}
         ORDER BY holiday_date ASC`,
        params,
      );

      sendSuccess(
        res,
        rows.map((r) => ({
          id: String(r.id),
          name: String(r.name),
          holidayDate: formatDate(String(r.holiday_date)),
          holidayType: String(r.holiday_type),
          description: r.description ? String(r.description) : null,
          isOptional: Boolean(r.is_optional),
          isActive: Boolean(r.is_active),
        })),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/',
  validate([
    body('name').notEmpty().isLength({ max: 200 }),
    body('holidayDate').isISO8601(),
    body('holidayType').optional().isString(),
    body('isOptional').optional().isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO holidays (name, holiday_date, holiday_type, description, is_optional, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          req.body.name,
          req.body.holidayDate,
          req.body.holidayType ?? 'national',
          req.body.description ?? null,
          req.body.isOptional ?? false,
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
        `UPDATE holidays SET name = $2, holiday_date = $3, holiday_type = $4, description = $5,
         is_optional = $6, is_active = $7, updated_at = NOW(), updated_by = $8
         WHERE id = $1 AND NOT is_deleted`,
        [
          paramId(req),
          req.body.name,
          req.body.holidayDate,
          req.body.holidayType ?? 'national',
          req.body.description ?? null,
          req.body.isOptional ?? false,
          req.body.isActive ?? true,
          req.user?.username ?? 'System',
        ],
      );
      sendNoContent(res);
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  '/:id',
  validate([param('id').isUUID()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await dbQuery(
        `UPDATE holidays SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [paramId(req), req.user?.username ?? 'System'],
      );
      sendNoContent(res);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
