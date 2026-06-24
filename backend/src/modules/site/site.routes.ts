import { Router } from 'express';
import { siteController } from './site.controller';
import {
  createSiteValidation,
  listSitesValidation,
  siteIdValidation,
  updateSiteValidation,
} from './site.validation';
import { deleteWithReasonValidation } from '../delete-requests/delete-requests.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/summary', (req, res, next) => {
  siteController.getSummary(req, res).catch(next);
});

router.get('/', validate(listSitesValidation), (req, res, next) => {
  siteController.list(req, res).catch(next);
});

router.post('/', validate(createSiteValidation), (req, res, next) => {
  siteController.create(req, res).catch(next);
});

router.get('/:id', validate(siteIdValidation), (req, res, next) => {
  siteController.getById(req, res).catch(next);
});

router.put('/:id', validate(updateSiteValidation), (req, res, next) => {
  siteController.update(req, res).catch(next);
});

router.delete('/:id', validate([...siteIdValidation, ...deleteWithReasonValidation]), (req, res, next) => {
  siteController.delete(req, res).catch(next);
});

export default router;
