import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { payslipController } from './payslip.controller';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';
import { parsePayslipStatusInput } from './payslip.constants';

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
    query('clientId').optional().isUUID(),
    query('departmentId').optional().isUUID(),
    query('search').optional().isString(),
    query('status').optional().isString(),
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
    body('employeeIds').optional().isArray(),
    body('employeeIds.*').optional().isUUID(),
    body('clientId').optional().isUUID(),
    body('departmentId').optional().isUUID(),
  ]),
  (req, res, next) => {
    payslipController.generate(req, res).catch(next);
  },
);

router.post(
  '/bulk-action',
  validate([
    body('payslipIds').isArray({ min: 1 }),
    body('payslipIds.*').isUUID(),
    body('action').isIn(['email', 'download']),
  ]),
  (req, res, next) => {
    payslipController.bulkAction(req, res).catch(next);
  },
);

router.get('/:id/print', validate([param('id').isUUID()]), (req, res, next) => {
  payslipController.print(req, res).catch(next);
});

router.post('/:id/email', validate([param('id').isUUID()]), (req, res, next) => {
  payslipController.email(req, res).catch(next);
});

router.patch(
  '/:id/status',
  validate([
    param('id').isUUID(),
    body('status').isString().custom((value) => !!parsePayslipStatusInput(String(value))),
    body('note').optional().isString(),
  ]),
  (req, res, next) => {
    payslipController.updateStatus(req, res).catch(next);
  },
);

router.delete('/:id', validate([param('id').isUUID()]), (req, res, next) => {
  payslipController.delete(req, res).catch(next);
});

router.get('/:id', validate([param('id').isUUID()]), (req, res, next) => {
  payslipController.getById(req, res).catch(next);
});

export default router;
