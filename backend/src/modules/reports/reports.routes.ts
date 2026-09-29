import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { reportsController } from './reports.controller';

const router = Router();
router.use(authenticate);

const filterValidation = [
  query('month').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }),
  query('year').optional({ values: 'falsy' }).isInt({ min: 2000, max: 2100 }),
  query('clientId').optional({ values: 'falsy' }).isUUID(),
];

router.get('/attendance', validate(filterValidation), (req, res, next) => {
  reportsController.attendance(req, res).catch(next);
});

router.get('/payroll', validate(filterValidation), (req, res, next) => {
  reportsController.payroll(req, res).catch(next);
});

router.get('/invoices', validate(filterValidation), (req, res, next) => {
  reportsController.invoices(req, res).catch(next);
});

router.get('/billing', validate(filterValidation), (req, res, next) => {
  reportsController.invoices(req, res).catch(next);
});

router.get('/employees', validate(filterValidation), (req, res, next) => {
  reportsController.employees(req, res).catch(next);
});

export default router;
