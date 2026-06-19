import { Router } from 'express';
import { employeeController } from './employee.controller';
import {
  createEmployeeValidation,
  employeeIdValidation,
  getEmployeesValidation,
  updateEmployeeValidation,
} from './employee.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';
import { photoUpload } from '../documents/upload.config';

const router = Router();

router.use(authenticate);

router.get('/', validate(getEmployeesValidation), (req, res, next) => {
  employeeController.getAll(req, res).catch(next);
});

router.get('/:id', validate(employeeIdValidation), (req, res, next) => {
  employeeController.getById(req, res).catch(next);
});

router.post('/:id/photo', validate(employeeIdValidation), photoUpload.single('photo'), (req, res, next) => {
  employeeController.uploadPhoto(req, res).catch(next);
});

router.post('/', validate(createEmployeeValidation), (req, res, next) => {
  employeeController.create(req, res).catch(next);
});

router.put('/:id', validate(updateEmployeeValidation), (req, res, next) => {
  employeeController.update(req, res).catch(next);
});

router.delete('/:id', validate(employeeIdValidation), (req, res, next) => {
  employeeController.delete(req, res).catch(next);
});

export default router;
