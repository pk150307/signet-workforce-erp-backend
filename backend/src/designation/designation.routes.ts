import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { designationController } from './designation.controller';
import {
  createDesignationValidation,
  designationIdValidation,
  listDesignationsValidation,
  nextDesignationCodeValidation,
  updateDesignationValidation,
} from './designation.validation';
import { deleteWithReasonValidation } from '../delete-requests/delete-requests.validation';

const router = Router();

router.use(authenticate);

router.get('/', validate(listDesignationsValidation), (req, res, next) => {
  designationController.list(req, res).catch(next);
});

router.get('/next-code', validate(nextDesignationCodeValidation), (req, res, next) => {
  designationController.generateCode(req, res).catch(next);
});

router.post('/', validate(createDesignationValidation), (req, res, next) => {
  designationController.create(req, res).catch(next);
});

router.get('/:id', validate(designationIdValidation), (req, res, next) => {
  designationController.getById(req, res).catch(next);
});

router.put('/:id', validate(updateDesignationValidation), (req, res, next) => {
  designationController.update(req, res).catch(next);
});

router.delete('/:id', validate([...designationIdValidation, ...deleteWithReasonValidation]), (req, res, next) => {
  designationController.delete(req, res).catch(next);
});

export default router;
