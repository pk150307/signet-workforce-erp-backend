import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { designationGradeController } from './designation-grade.controller';
import {
  createDesignationGradeValidation,
  designationGradeIdValidation,
  designationIdParamValidation,
  listDesignationGradesValidation,
  updateDesignationGradeValidation,
} from './designation-grade.validation';

const router = Router();

router.use(authenticate);

router.get('/', validate(listDesignationGradesValidation), (req, res, next) => {
  designationGradeController.list(req, res).catch(next);
});

router.get('/by-designation/:designationId', validate(designationIdParamValidation), (req, res, next) => {
  designationGradeController.listByDesignation(req, res).catch(next);
});

router.post('/', validate(createDesignationGradeValidation), (req, res, next) => {
  designationGradeController.create(req, res).catch(next);
});

router.get('/:id', validate(designationGradeIdValidation), (req, res, next) => {
  designationGradeController.getById(req, res).catch(next);
});

router.put('/:id', validate(updateDesignationGradeValidation), (req, res, next) => {
  designationGradeController.update(req, res).catch(next);
});

router.delete('/:id', validate(designationGradeIdValidation), (req, res, next) => {
  designationGradeController.delete(req, res).catch(next);
});

export default router;
