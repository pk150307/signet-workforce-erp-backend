import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { payslipController } from './payslip.controller';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
    query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
    query('employeeId').optional().isUUID(),
  ]),
  (req, res, next) => {
    payslipController.list(req, res).catch(next);
  },
);

router.post(
  '/generate',
  validate([
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000, max: 2100 }),
  ]),
  (req, res, next) => {
    payslipController.generate(req, res).catch(next);
  },
);

router.get('/:id/print', validate([param('id').isUUID()]), (req, res, next) => {
  payslipController.print(req, res).catch(next);
});

router.get('/:id', validate([param('id').isUUID()]), (req, res, next) => {
  payslipController.getById(req, res).catch(next);
});

export default router;
