import { param, query } from 'express-validator';
import { pageSizeQueryValidator } from '../../types';

export const listAuditLogsValidation = [
  pageSizeQueryValidator,
  query('cursor').optional().isString().trim(),
  query('direction').optional().isIn(['next', 'prev']),
  query('userId').optional().isUUID(),
  query('module').optional().isString().trim().isLength({ max: 100 }),
  query('action').optional().isString().trim().isLength({ max: 100 }),
  query('entityType').optional().isString().trim().isLength({ max: 100 }),
  query('entityId').optional().isUUID(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('ipAddress').optional().isString().trim().isLength({ max: 50 }),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

export const exportAuditLogsValidation = [
  ...listAuditLogsValidation,
  query('format').optional().isIn(['excel', 'pdf']),
];

export const auditLogIdValidation = [param('id').isUUID().withMessage('Invalid audit log id')];

export const auditLogSummaryValidation = [
  query('userId').optional().isUUID(),
  query('module').optional().isString().trim().isLength({ max: 100 }),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
];
