import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { departmentController } from './department.controller';
import {
  createDepartmentValidation,
  departmentIdValidation,
  listDepartmentsValidation,
  nextDepartmentCodeValidation,
  updateDepartmentValidation,
} from './department.validation';
import { deleteWithReasonValidation } from '../delete-requests/delete-requests.validation';

const router = Router();

router.use(authenticate);

router.get('/', validate(listDepartmentsValidation), (req, res, next) => {
  departmentController.list(req, res).catch(next);
});

router.get('/next-code', validate(nextDepartmentCodeValidation), (req, res, next) => {
  departmentController.generateCode(req, res).catch(next);
});

router.post('/', validate(createDepartmentValidation), (req, res, next) => {
  departmentController.create(req, res).catch(next);
});

router.get('/:id', validate(departmentIdValidation), (req, res, next) => {
  departmentController.getById(req, res).catch(next);
});

router.put('/:id', validate(updateDepartmentValidation), (req, res, next) => {
  departmentController.update(req, res).catch(next);
});

router.delete('/:id', validate([...departmentIdValidation, ...deleteWithReasonValidation]), (req, res, next) => {
  departmentController.delete(req, res).catch(next);
});

export default router;
