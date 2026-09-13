import { body, param, query } from 'express-validator';
import { pageSizeQueryValidator } from '../../types';

export const listSalaryRegisterValidation = [
  pageSizeQueryValidator,
  query('cursor').optional().isString().trim(),
  query('direction').optional().isIn(['next', 'prev']),
  query('clientId').optional().isUUID(),
  query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
  query('status')
    .optional()
    .isIn(['draft', 'calculated', 'reviewed', 'finalized', 'reopened']),
  query('search').optional().isString().trim(),
];

export const generateSalaryRegisterValidation = [
  body('clientId').isUUID().withMessage('Valid client ID is required'),
  body('month').isInt({ min: 1, max: 12 }).toInt(),
  body('year').isInt({ min: 2000, max: 2100 }).toInt(),
];

export const salaryRegisterIdValidation = [
  param('id').isUUID().withMessage('Valid salary register ID is required'),
];

export const updateEmployeeRowValidation = [
  ...salaryRegisterIdValidation,
  param('employeeRowId').isUUID(),
  body('payDays').optional().isFloat({ min: 0, max: 31 }),
  body('nAll').optional().isFloat({ min: 0 }),
  body('attAwAfd').optional().isFloat({ min: 0 }),
];

export const reopenValidation = [
  ...salaryRegisterIdValidation,
  body('reason').optional().isString().trim().isLength({ max: 1000 }),
];
