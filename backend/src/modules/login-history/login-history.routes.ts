import { Router } from 'express';
import { loginHistoryController } from './login-history.controller';
import { listLoginHistoryValidation } from './login-history.validation';
import { validate } from '../../common/response';
import { authenticate, authorizePermission } from '../../middleware/auth.middleware';
import { USER_PERMISSIONS } from '../users/users.permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorizePermission(USER_PERMISSIONS.READ),
  validate(listLoginHistoryValidation),
  (req, res, next) => {
    loginHistoryController.list(req, res).catch(next);
  },
);

router.get(
  '/summary',
  authorizePermission(USER_PERMISSIONS.READ),
  validate(listLoginHistoryValidation),
  (req, res, next) => {
    loginHistoryController.summary(req, res).catch(next);
  },
);

export default router;
