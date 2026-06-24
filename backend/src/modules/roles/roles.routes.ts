import { Router } from 'express';
import { rolesController } from './roles.controller';
import {
  createRoleValidation,
  listRolesValidation,
  roleIdValidation,
  updateRolePermissionsValidation,
  updateRoleValidation,
} from './roles.validation';
import { validate } from '../../common/response';
import { authenticate, authorizePermission } from '../../middleware/auth.middleware';
import { ROLE_PERMISSIONS } from './roles.permissions';

const router = Router();

router.use(authenticate);

router.get('/', authorizePermission(ROLE_PERMISSIONS.READ), validate(listRolesValidation), (req, res, next) => {
  rolesController.list(req, res).catch(next);
});

router.post('/', authorizePermission(ROLE_PERMISSIONS.CREATE), validate(createRoleValidation), (req, res, next) => {
  rolesController.create(req, res).catch(next);
});

router.put(
  '/:id/permissions',
  authorizePermission(ROLE_PERMISSIONS.UPDATE),
  validate(updateRolePermissionsValidation),
  (req, res, next) => {
    rolesController.updatePermissions(req, res).catch(next);
  },
);

router.get('/:id', authorizePermission(ROLE_PERMISSIONS.READ), validate(roleIdValidation), (req, res, next) => {
  rolesController.getById(req, res).catch(next);
});

router.put('/:id', authorizePermission(ROLE_PERMISSIONS.UPDATE), validate(updateRoleValidation), (req, res, next) => {
  rolesController.update(req, res).catch(next);
});

export default router;
