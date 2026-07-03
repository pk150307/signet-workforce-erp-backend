import { Router } from 'express';
import { validate } from '../../common/response';
import { authenticate, authorizePermission } from '../../middleware/auth.middleware';
import { deleteRequestsController } from './delete-requests.controller';
import { DELETE_REQUEST_PERMISSIONS } from './delete-requests.permissions';
import {
  createDeleteRequestValidation,
  deleteRequestIdValidation,
  listDeleteRequestsValidation,
  rejectDeleteRequestValidation,
} from './delete-requests.validation';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorizePermission(DELETE_REQUEST_PERMISSIONS.READ),
  validate(listDeleteRequestsValidation),
  (req, res, next) => {
    deleteRequestsController.list(req, res).catch(next);
  },
);

router.post(
  '/',
  authorizePermission(DELETE_REQUEST_PERMISSIONS.CREATE),
  validate(createDeleteRequestValidation),
  (req, res, next) => {
    deleteRequestsController.create(req, res).catch(next);
  },
);

router.get(
  '/:id',
  authorizePermission(DELETE_REQUEST_PERMISSIONS.READ),
  validate(deleteRequestIdValidation),
  (req, res, next) => {
    deleteRequestsController.getById(req, res).catch(next);
  },
);

router.put(
  '/:id/approve',
  authorizePermission(DELETE_REQUEST_PERMISSIONS.APPROVE),
  validate(deleteRequestIdValidation),
  (req, res, next) => {
    deleteRequestsController.approve(req, res).catch(next);
  },
);

router.put(
  '/:id/reject',
  authorizePermission(DELETE_REQUEST_PERMISSIONS.APPROVE),
  validate(rejectDeleteRequestValidation),
  (req, res, next) => {
    deleteRequestsController.reject(req, res).catch(next);
  },
);

export default router;
