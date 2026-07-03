import { Router } from 'express';
import { contractController } from './contract.controller';
import {
  contractClientIdValidation,
  contractIdValidation,
  createContractValidation,
  listContractsValidation,
  suggestContractValidation,
  updateContractStatusValidation,
  updateContractValidation,
} from './contract.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';
import { upload } from '../documents/upload.config';

const router = Router();

router.use(authenticate);

router.get('/summary', validate(listContractsValidation), (req, res, next) => {
  contractController.getSummary(req, res).catch(next);
});

router.get('/suggest', validate(suggestContractValidation), (req, res, next) => {
  contractController.suggestDefaults(req, res).catch(next);
});

router.get('/client/:clientId', validate([...contractClientIdValidation, ...listContractsValidation]), (req, res, next) => {
  contractController.listByClient(req, res).catch(next);
});

router.get('/', validate(listContractsValidation), (req, res, next) => {
  contractController.list(req, res).catch(next);
});

router.post('/', validate(createContractValidation), (req, res, next) => {
  contractController.create(req, res).catch(next);
});

router.get('/:id/documents', validate(contractIdValidation), (req, res, next) => {
  contractController.listDocuments(req, res).catch(next);
});

router.post(
  '/:id/documents',
  validate(contractIdValidation),
  upload.single('file'),
  (req, res, next) => {
    contractController.uploadDocument(req, res).catch(next);
  },
);

router.patch('/:id/status', validate(updateContractStatusValidation), (req, res, next) => {
  contractController.updateStatus(req, res).catch(next);
});

router.get('/:id', validate(contractIdValidation), (req, res, next) => {
  contractController.getById(req, res).catch(next);
});

router.put('/:id', validate(updateContractValidation), (req, res, next) => {
  contractController.update(req, res).catch(next);
});

router.delete('/:id', validate(contractIdValidation), (req, res, next) => {
  contractController.delete(req, res).catch(next);
});

export default router;
