import { Router } from 'express';
import { query } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess } from '../../common/response';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query<{ id: string; code: string; name: string; description: string | null }>(
      `SELECT code AS id, code, name, description FROM departments
       WHERE is_active AND NOT is_deleted ORDER BY name`,
    );
    sendSuccess(res, rows);
  } catch (e) {
    next(e);
  }
});

export default router;
