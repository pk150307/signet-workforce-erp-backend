import { Router } from 'express';
import { clientController } from './client.controller';
import {
  clientIdValidation,
  clientSitesValidation,
  createClientValidation,
  listClientsValidation,
  updateClientValidation,
} from './client.validation';
import { deleteWithReasonValidation } from '../delete-requests/delete-requests.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', validate(listClientsValidation), (req, res, next) => {
  clientController.list(req, res).catch(next);
});

router.post('/', validate(createClientValidation), (req, res, next) => {
  clientController.create(req, res).catch(next);
});

router.get('/:id/sites', validate(clientSitesValidation), (req, res, next) => {
  clientController.listSites(req, res).catch(next);
});

router.get('/:id', validate(clientIdValidation), (req, res, next) => {
  clientController.getById(req, res).catch(next);
});

router.put('/:id', validate(updateClientValidation), (req, res, next) => {
  clientController.update(req, res).catch(next);
});

router.delete('/:id', validate([...clientIdValidation, ...deleteWithReasonValidation]), (req, res, next) => {
  clientController.delete(req, res).catch(next);
});

export default router;
