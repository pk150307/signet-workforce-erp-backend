import { Router, Request, Response, NextFunction } from 'express';
import { param, query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendNoContent, sendSuccess, validate } from '../../common/response';
import { createPaginatedResult } from '../../types';
import { paramId } from '../../utils/request';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('unreadOnly').optional().isBoolean(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 20;
      const conditions = ['NOT n.is_deleted', 'n.user_id = $1'];
      const params: unknown[] = [req.user!.userId];

      if (req.query.unreadOnly === 'true') {
        conditions.push('NOT n.is_read');
      }

      const where = conditions.join(' AND ');
      const count = await dbQuery<{ count: string }>(
        `SELECT COUNT(*) AS count FROM notifications n WHERE ${where}`,
        params,
      );

      const { rows } = await dbQuery<Record<string, unknown>>(
        `SELECT n.id, n.title, n.message, n.is_read, n.read_at, n.link, n.created_at
         FROM notifications n WHERE ${where}
         ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`,
        [...params, pageSize, (page - 1) * pageSize],
      );

      const items = rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        message: String(r.message),
        isRead: Boolean(r.is_read),
        readAt: r.read_at ? new Date(String(r.read_at)).toISOString() : null,
        link: r.link ? String(r.link) : null,
        createdAt: new Date(String(r.created_at)).toISOString(),
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

router.put('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dbQuery(
      `UPDATE notifications SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND NOT is_read AND NOT is_deleted`,
      [req.user!.userId],
    );
    sendNoContent(res);
  } catch (e) {
    next(e);
  }
});

router.put(
  '/:id/read',
  validate([param('id').isUUID()]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await dbQuery(
        `UPDATE notifications SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND NOT is_deleted`,
        [paramId(req), req.user!.userId],
      );
      sendNoContent(res);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
