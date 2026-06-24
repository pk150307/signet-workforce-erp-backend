import { Router } from 'express';
import { rolesController } from './roles.controller';
import { listPermissionsValidation } from './roles.validation';
import { validate } from '../../common/response';
import { authenticate, authorizePermission } from '../../middleware/auth.middleware';
import { ROLE_PERMISSIONS } from './roles.permissions';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorizePermission(ROLE_PERMISSIONS.READ),
  validate(listPermissionsValidation),
  (req, res, next) => {
    rolesController.listPermissions(req, res).catch(next);
  },
);

export default router;
