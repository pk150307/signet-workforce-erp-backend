import { body, param, query } from 'express-validator';
import { DELETE_REQUEST_STATUS } from '../iam/iam.constants';

export const listDeleteRequestsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status')
    .optional()
    .isIn(Object.values(DELETE_REQUEST_STATUS))
    .withMessage('Invalid status'),
  query('module').optional().isString().trim().isLength({ max: 100 }),
  query('entityType').optional().isString().trim().isLength({ max: 100 }),
  query('requestedBy').optional().isUUID(),
  query('reviewedBy').optional().isUUID(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

export const deleteRequestIdValidation = [param('id').isUUID().withMessage('Invalid delete request id')];

export const createDeleteRequestValidation = [
  body('module').trim().notEmpty().isLength({ max: 100 }),
  body('entityType').trim().notEmpty().isLength({ max: 100 }),
  body('entityId').isUUID(),
  body('entityLabel').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('reason').trim().notEmpty().isLength({ min: 3, max: 2000 }),
  body('entitySnapshot').optional({ nullable: true }).isObject(),
];

export const rejectDeleteRequestValidation = [
  ...deleteRequestIdValidation,
  body('rejectionRemarks').trim().notEmpty().isLength({ min: 3, max: 2000 }),
];

export const deleteWithReasonValidation = [
  body('reason').optional().trim().isLength({ min: 3, max: 2000 }),
];
