import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { salaryRegisterController } from './salary-register.controller';
import {
  generateSalaryRegisterValidation,
  listSalaryRegisterValidation,
  reopenValidation,
  salaryRegisterIdValidation,
  updateEmployeeRowValidation,
} from './salary-register.validation';

const router = Router();

router.use(authenticate);

router.get('/', validate(listSalaryRegisterValidation), (req, res, next) => {
  salaryRegisterController.list(req, res).catch(next);
});

router.post('/generate', validate(generateSalaryRegisterValidation), (req, res, next) => {
  salaryRegisterController.generate(req, res).catch(next);
});

router.get('/:id', validate(salaryRegisterIdValidation), (req, res, next) => {
  salaryRegisterController.getById(req, res).catch(next);
});

router.post('/:id/recalculate', validate(salaryRegisterIdValidation), (req, res, next) => {
  salaryRegisterController.recalculate(req, res).catch(next);
});

router.patch(
  '/:id/employees/:employeeRowId',
  validate(updateEmployeeRowValidation),
  (req, res, next) => {
    salaryRegisterController.updateEmployeeRow(req, res).catch(next);
  },
);

router.post('/:id/finalize', validate(salaryRegisterIdValidation), (req, res, next) => {
  salaryRegisterController.finalize(req, res).catch(next);
});

router.post('/:id/reopen', validate(reopenValidation), (req, res, next) => {
  salaryRegisterController.reopen(req, res).catch(next);
});

router.get('/:id/export/excel', validate(salaryRegisterIdValidation), (req, res, next) => {
  salaryRegisterController.exportExcel(req, res).catch(next);
});

router.get('/:id/export/pdf', validate(salaryRegisterIdValidation), (req, res, next) => {
  salaryRegisterController.exportPdf(req, res).catch(next);
});

export default router;
