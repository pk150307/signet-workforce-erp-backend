import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { employeeAdvancesController } from './employee-advances.controller';
import {
  advancePaymentIdValidation,
  createAdvancePaymentValidation,
  employeeAdvanceIdValidation,
  generateEmployeeAdvanceValidation,
  listEmployeeAdvanceValidation,
  reopenAdvanceValidation,
  updateAdvancePaymentValidation,
} from './employee-advances.validation';

const router = Router();

router.use(authenticate);

router.get('/', validate(listEmployeeAdvanceValidation), (req, res, next) => {
  employeeAdvancesController.list(req, res).catch(next);
});

router.post('/generate', validate(generateEmployeeAdvanceValidation), (req, res, next) => {
  employeeAdvancesController.generate(req, res).catch(next);
});

router.get('/:id', validate(employeeAdvanceIdValidation), (req, res, next) => {
  employeeAdvancesController.getById(req, res).catch(next);
});

router.post('/:id/refresh', validate(employeeAdvanceIdValidation), (req, res, next) => {
  employeeAdvancesController.refresh(req, res).catch(next);
});

router.post(
  '/:id/entries/:entryId/payments',
  validate(createAdvancePaymentValidation),
  (req, res, next) => {
    employeeAdvancesController.addPayment(req, res).catch(next);
  },
);

router.patch(
  '/:id/entries/:entryId/payments/:paymentId',
  validate(updateAdvancePaymentValidation),
  (req, res, next) => {
    employeeAdvancesController.updatePayment(req, res).catch(next);
  },
);

router.delete(
  '/:id/entries/:entryId/payments/:paymentId',
  validate(advancePaymentIdValidation),
  (req, res, next) => {
    employeeAdvancesController.deletePayment(req, res).catch(next);
  },
);

router.post('/:id/finalize', validate(employeeAdvanceIdValidation), (req, res, next) => {
  employeeAdvancesController.finalize(req, res).catch(next);
});

router.post('/:id/reopen', validate(reopenAdvanceValidation), (req, res, next) => {
  employeeAdvancesController.reopen(req, res).catch(next);
});

router.get('/:id/export/excel', validate(employeeAdvanceIdValidation), (req, res, next) => {
  employeeAdvancesController.exportExcel(req, res).catch(next);
});

router.get('/:id/export/pdf', validate(employeeAdvanceIdValidation), (req, res, next) => {
  employeeAdvancesController.exportPdf(req, res).catch(next);
});

export default router;
