import { Router } from 'express';
import { companyController } from './company.controller';
import {
  idParamValidation,
  listCompanyValidation,
  updateProfileValidation,
} from './company.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/profile', (req, res, next) => {
  companyController.getProfile(req, res).catch(next);
});

router.put('/profile', validate(updateProfileValidation), (req, res, next) => {
  companyController.updateProfile(req, res).catch(next);
});

router.get('/branches', validate(listCompanyValidation), (req, res, next) => {
  companyController.listBranches(req, res).catch(next);
});

router.delete('/branches/:id', validate(idParamValidation), (req, res, next) => {
  companyController.deleteBranch(req, res).catch(next);
});

router.get('/offices', validate(listCompanyValidation), (req, res, next) => {
  companyController.listOffices(req, res).catch(next);
});

router.delete('/offices/:id', validate(idParamValidation), (req, res, next) => {
  companyController.deleteOffice(req, res).catch(next);
});

export default router;
