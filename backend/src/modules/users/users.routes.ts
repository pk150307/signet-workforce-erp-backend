import { Router } from 'express';
import { usersController } from './users.controller';
import {
  createUserValidation,
  listUsersValidation,
  loginHistoryValidation,
  resetPasswordValidation,
  updateUserStatusValidation,
  updateUserValidation,
  userIdValidation,
} from './users.validation';
import { validate } from '../../common/response';
import { authenticate, authorizePermission } from '../../middleware/auth.middleware';
import { USER_PERMISSIONS } from './users.permissions';

const router = Router();

router.use(authenticate);

router.get('/', authorizePermission(USER_PERMISSIONS.READ), validate(listUsersValidation), (req, res, next) => {
  usersController.list(req, res).catch(next);
});

router.post('/', authorizePermission(USER_PERMISSIONS.CREATE), validate(createUserValidation), (req, res, next) => {
  usersController.create(req, res).catch(next);
});

router.get(
  '/:id/login-history',
  authorizePermission(USER_PERMISSIONS.READ),
  validate(loginHistoryValidation),
  (req, res, next) => {
    usersController.loginHistory(req, res).catch(next);
  },
);

router.get('/:id', authorizePermission(USER_PERMISSIONS.READ), validate(userIdValidation), (req, res, next) => {
  usersController.getById(req, res).catch(next);
});

router.put('/:id', authorizePermission(USER_PERMISSIONS.UPDATE), validate(updateUserValidation), (req, res, next) => {
  usersController.update(req, res).catch(next);
});

router.patch(
  '/:id/status',
  authorizePermission(USER_PERMISSIONS.UPDATE),
  validate(updateUserStatusValidation),
  (req, res, next) => {
    usersController.updateStatus(req, res).catch(next);
  },
);

router.post(
  '/:id/reset-password',
  authorizePermission(USER_PERMISSIONS.APPROVE),
  validate(resetPasswordValidation),
  (req, res, next) => {
    usersController.resetPassword(req, res).catch(next);
  },
);

export default router;
