import { Router } from 'express';
import { billingConfigurationController } from './billing-configuration.controller';
import {
  billingConfigurationIdValidation,
  billingConfigurationSiteIdValidation,
  createBillingConfigurationValidation,
  listBillingConfigurationsValidation,
  updateBillingConfigurationValidation,
} from './billing-configuration.validation';
import { validate } from '../../common/response';

const router = Router();

router.get('/components', (req, res, next) => {
  billingConfigurationController.listComponents(req, res).catch(next);
});

router.get('/', validate(listBillingConfigurationsValidation), (req, res, next) => {
  billingConfigurationController.list(req, res).catch(next);
});

router.get('/by-site/:siteId', validate(billingConfigurationSiteIdValidation), (req, res, next) => {
  billingConfigurationController.getBySiteId(req, res).catch(next);
});

router.get('/:id', validate(billingConfigurationIdValidation), (req, res, next) => {
  billingConfigurationController.getById(req, res).catch(next);
});

router.post('/', validate(createBillingConfigurationValidation), (req, res, next) => {
  billingConfigurationController.create(req, res).catch(next);
});

router.put('/:id', validate(updateBillingConfigurationValidation), (req, res, next) => {
  billingConfigurationController.update(req, res).catch(next);
});

router.delete('/:id', validate(billingConfigurationIdValidation), (req, res, next) => {
  billingConfigurationController.delete(req, res).catch(next);
});

export default router;
