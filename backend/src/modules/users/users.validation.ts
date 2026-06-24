import { body, param, query } from 'express-validator';
import { LOGIN_STATUS } from '../iam/iam.constants';
import { validatePasswordPolicy } from '../../utils/password-policy';

export const listUsersValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().toBoolean(),
  query('status').optional().isString().trim(),
  query('roleId').optional().isUUID(),
  query('departmentId').optional().isUUID(),
];

export const userIdValidation = [param('id').isUUID().withMessage('Valid user id is required')];

export const loginHistoryValidation = [
  ...userIdValidation,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('loginStatus')
    .optional()
    .isIn([LOGIN_STATUS.SUCCESS, LOGIN_STATUS.FAILED, LOGIN_STATUS.LOCKED, LOGIN_STATUS.LOGOUT]),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('search').optional().isString().trim(),
  query('isNewDevice').optional().isBoolean().toBoolean(),
];

export const createUserValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 100 }),
  body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ max: 100 }),
  body('username').optional().isString().trim().isLength({ min: 3, max: 100 }),
  body('password')
    .optional()
    .custom((value: string) => {
      if (!value) return true;
      const result = validatePasswordPolicy(value);
      if (!result.valid) throw new Error(result.errors[0]);
      return true;
    }),
  body('mobile').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('employeeId').optional({ nullable: true }).isUUID(),
  body('departmentId').optional({ nullable: true }).isUUID(),
  body('roleIds').isArray({ min: 1 }).withMessage('At least one role is required'),
  body('roleIds.*').isUUID(),
  body('profilePhotoUrl').optional({ nullable: true }).isString(),
  body('isActive').optional().isBoolean(),
  body('forcePasswordReset').optional().isBoolean(),
];

export const updateUserValidation = [
  ...userIdValidation,
  body('email').optional().isEmail().normalizeEmail(),
  body('firstName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('lastName').optional().trim().notEmpty().isLength({ max: 100 }),
  body('mobile').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('employeeId').optional({ nullable: true }).isUUID(),
  body('departmentId').optional({ nullable: true }).isUUID(),
  body('roleIds').optional().isArray({ min: 1 }),
  body('roleIds.*').optional().isUUID(),
  body('profilePhotoUrl').optional({ nullable: true }).isString(),
  body('isActive').optional().isBoolean(),
];

export const updateUserStatusValidation = [
  ...userIdValidation,
  body('isActive').isBoolean().withMessage('isActive is required'),
  body('unlockAccount').optional().isBoolean(),
];

export const resetPasswordValidation = [
  ...userIdValidation,
  body('mode').isIn(['temporary', 'email']).withMessage('mode must be temporary or email'),
  body('temporaryPassword')
    .optional()
    .custom((value: string) => {
      if (!value) return true;
      const result = validatePasswordPolicy(value);
      if (!result.valid) throw new Error(result.errors[0]);
      return true;
    }),
  body('forcePasswordReset').optional().isBoolean(),
];
