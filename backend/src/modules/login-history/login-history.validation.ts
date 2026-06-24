import { query } from 'express-validator';
import { LOGIN_STATUS } from '../iam/iam.constants';

export const listLoginHistoryValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('userId').optional().isUUID(),
  query('loginStatus')
    .optional()
    .isIn([LOGIN_STATUS.SUCCESS, LOGIN_STATUS.FAILED, LOGIN_STATUS.LOCKED, LOGIN_STATUS.LOGOUT]),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('search').optional().isString().trim(),
  query('isNewDevice').optional().isBoolean().toBoolean(),
];
