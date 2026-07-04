import { query } from 'express-validator';
import { pageSizeQueryValidator } from '../../types';
import { LOGIN_STATUS } from '../iam/iam.constants';

export const listLoginHistoryValidation = [
  pageSizeQueryValidator,
  query('cursor').optional().isString().trim(),
  query('direction').optional().isIn(['next', 'prev']),
  query('userId').optional().isUUID(),
  query('loginStatus')
    .optional()
    .isIn([LOGIN_STATUS.SUCCESS, LOGIN_STATUS.FAILED, LOGIN_STATUS.LOCKED, LOGIN_STATUS.LOGOUT]),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('search').optional().isString().trim(),
  query('isNewDevice').optional().isBoolean().toBoolean(),
];
