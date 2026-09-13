import { body, param, query } from 'express-validator';
import { pageSizeQueryValidator } from '../../types';

export const listEmployeeAdvanceValidation = [
  pageSizeQueryValidator,
  query('cursor').optional().isString().trim(),
  query('direction').optional().isIn(['next', 'prev']),
  query('clientId').optional().isUUID(),
  query('month').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('year').optional().isInt({ min: 2000, max: 2100 }).toInt(),
  query('status').optional().isIn(['draft', 'open', 'finalized', 'reopened']),
  query('search').optional().isString().trim(),
];

export const generateEmployeeAdvanceValidation = [
  body('clientId').isUUID().withMessage('Valid client ID is required'),
  body('month').isInt({ min: 1, max: 12 }).toInt(),
  body('year').isInt({ min: 2000, max: 2100 }).toInt(),
];

export const employeeAdvanceIdValidation = [
  param('id').isUUID().withMessage('Valid advance register ID is required'),
];

export const advanceEntryIdValidation = [
  ...employeeAdvanceIdValidation,
  param('entryId').isUUID(),
];

export const advancePaymentIdValidation = [
  ...advanceEntryIdValidation,
  param('paymentId').isUUID(),
];

const paymentBody = [
  body('paidOn')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('paidOn must be YYYY-MM-DD'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be greater than 0'),
  body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

export const createAdvancePaymentValidation = [...advanceEntryIdValidation, ...paymentBody];

export const updateAdvancePaymentValidation = [...advancePaymentIdValidation, ...paymentBody];

export const reopenAdvanceValidation = [
  ...employeeAdvanceIdValidation,
  body('reason').optional().isString().trim().isLength({ max: 1000 }),
];
