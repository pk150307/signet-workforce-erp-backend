import { param, query } from 'express-validator';
import { NOTIFICATION_PRIORITY, NOTIFICATION_TYPE } from '../iam/iam.constants';

export const listNotificationsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('unreadOnly').optional().isIn(['true', 'false']),
  query('notificationType')
    .optional()
    .isIn(Object.values(NOTIFICATION_TYPE))
    .withMessage('Invalid notification type'),
  query('referenceType').optional().isString().trim().isLength({ max: 100 }),
  query('referenceId').optional().isUUID(),
  query('priority')
    .optional()
    .isIn(Object.values(NOTIFICATION_PRIORITY))
    .withMessage('Invalid priority'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('search').optional().isString().trim().isLength({ max: 200 }),
];

export const notificationIdValidation = [
  param('id').isUUID().withMessage('Invalid notification id'),
];
