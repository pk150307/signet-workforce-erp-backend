import { Router } from 'express';
import { query as queryValidator } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendSuccess, validate } from '../../common/response';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([queryValidator('departmentId').optional().isString()]),
  async (req, res, next) => {
    try {
      const departmentId = req.query.departmentId as string | undefined;
      const params: unknown[] = [];
      let filter = 'des.is_active AND NOT des.is_deleted';

      if (departmentId) {
        filter += ` AND (des.department_id = $1::uuid OR d.code = $1)`;
        params.push(departmentId);
      }

      const { rows } = await dbQuery<{
        id: string;
        code: string;
        name: string;
        department_id: string;
        department_name: string;
        level: number;
      }>(
        `SELECT des.code AS id, des.code, des.name, d.code AS department_id, d.name AS department_name, des.level
         FROM designations des
         INNER JOIN departments d ON d.id = des.department_id
         WHERE ${filter}
         ORDER BY des.level, des.name`,
        params,
      );
      sendSuccess(res, rows);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
