import { Router } from 'express';
import { statutoryController } from './statutory.controller';
import {
  employeeIdParamValidation,
  exportPfEsicValidation,
  listPfEsicValidation,
  upsertPfEsicValidation,
} from './statutory.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';
import { body } from 'express-validator';

const router = Router();
router.use(authenticate);

router.get('/pf-esic/export', validate(exportPfEsicValidation), (req, res, next) => {
  statutoryController.export(req, res).catch(next);
});

router.get('/pf-esic', validate(listPfEsicValidation), (req, res, next) => {
  statutoryController.list(req, res).catch(next);
});

router.get('/pf-esic/:employeeId', validate(employeeIdParamValidation), (req, res, next) => {
  statutoryController.getByEmployeeId(req, res).catch(next);
});

router.put('/pf-esic/:employeeId', validate(upsertPfEsicValidation), (req, res, next) => {
  statutoryController.upsert(req, res).catch(next);
});

router.post(
  '/pf-esic/bulk',
  validate([
    body('items').isArray({ min: 1 }),
    body('items.*.employeeId').isUUID(),
  ]),
  (req, res, next) => {
    statutoryController.bulkUpsert(req, res).catch(next);
  },
);

export default router;
