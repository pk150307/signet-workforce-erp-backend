import { body, param, query } from 'express-validator';

export const listRolesValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().toBoolean(),
  query('isSystem').optional().isBoolean().toBoolean(),
];

export const roleIdValidation = [param('id').isUUID().withMessage('Valid role id is required')];

export const createRoleValidation = [
  body('name').trim().notEmpty().withMessage('Role name is required').isLength({ max: 100 }),
  body('description').optional({ nullable: true }).isString().trim(),
  body('isActive').optional().isBoolean(),
  body('permissionIds').optional().isArray(),
  body('permissionIds.*').optional().isUUID(),
];

export const updateRoleValidation = [
  ...roleIdValidation,
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('description').optional({ nullable: true }).isString().trim(),
  body('isActive').optional().isBoolean(),
];

export const updateRolePermissionsValidation = [
  ...roleIdValidation,
  body('permissionIds').isArray({ min: 1 }).withMessage('At least one permission is required'),
  body('permissionIds.*').isUUID(),
];

export const listPermissionsValidation = [
  query('module').optional().isString().trim(),
  query('groupByModule').optional().isBoolean().toBoolean(),
];
