import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendCreated, sendNoContent, sendSuccess, validate } from '../../common/response';
import { paramId } from '../../utils/request';
import { formatTime } from '../../utils/formatters';

const router = Router();
router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await dbQuery<Record<string, unknown>>(
      `SELECT id, code, name, description, start_time, end_time, grace_minutes, break_minutes,
              is_night_shift, is_active
       FROM shifts WHERE NOT is_deleted AND is_active ORDER BY name`,
    );
    sendSuccess(
      res,
      rows.map((r) => ({
        id: String(r.id),
        code: String(r.code),
        name: String(r.name),
        description: r.description ? String(r.description) : null,
        startTime: formatTime(String(r.start_time)),
        endTime: formatTime(String(r.end_time)),
        graceMinutes: Number(r.grace_minutes),
        breakMinutes: Number(r.break_minutes),
        isNightShift: Boolean(r.is_night_shift),
        isActive: Boolean(r.is_active),
      })),
    );
  } catch (e) {
    next(e);
  }
});

router.post(
  '/',
  validate([
    body('code').notEmpty().isLength({ max: 50 }),
    body('name').notEmpty().isLength({ max: 200 }),
    body('startTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('endTime').matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('graceMinutes').optional().isInt({ min: 0 }),
    body('breakMinutes').optional().isInt({ min: 0 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO shifts (code, name, description, start_time, end_time, grace_minutes, break_minutes, is_night_shift, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          req.body.code,
          req.body.name,
          req.body.description ?? null,
          req.body.startTime,
          req.body.endTime,
          req.body.graceMinutes ?? 15,
          req.body.breakMinutes ?? 60,
          req.body.isNightShift ?? false,
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
        `UPDATE shifts SET name = $2, description = $3, start_time = $4, end_time = $5,
         grace_minutes = $6, break_minutes = $7, is_night_shift = $8, is_active = $9,
         updated_at = NOW(), updated_by = $10
         WHERE id = $1 AND NOT is_deleted`,
        [
          paramId(req),
          req.body.name,
          req.body.description ?? null,
          req.body.startTime,
          req.body.endTime,
          req.body.graceMinutes ?? 15,
          req.body.breakMinutes ?? 60,
          req.body.isNightShift ?? false,
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

export default router;
