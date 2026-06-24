import { param, query } from 'express-validator';

export const listAuditLogsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
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

export const auditLogIdValidation = [param('id').isUUID().withMessage('Invalid audit log id')];

export const auditLogSummaryValidation = [
  query('userId').optional().isUUID(),
  query('module').optional().isString().trim().isLength({ max: 100 }),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
];
