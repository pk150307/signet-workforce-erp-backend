import { body, param, query } from 'express-validator';

export const registerPeriodQuery = [
  query('clientId').isUUID(),
  query('month').isInt({ min: 1, max: 12 }).toInt(),
  query('year').isInt({ min: 2000, max: 2100 }).toInt(),
];

export const updateCellsValidation = [
  body('clientId').isUUID(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000, max: 2100 }),
  body('updates').isArray({ min: 1 }),
  body('updates.*.employeeId').isUUID(),
  body('updates.*.date').isISO8601(),
  body('updates.*.status').optional({ nullable: true }).isInt({ min: 1, max: 8 }),
];

export const submitEmployeeRowValidation = [
  param('employeeId').isUUID(),
  body('clientId').isUUID(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000, max: 2100 }),
  body('cells').isArray({ min: 1 }),
  body('cells.*.date').isISO8601(),
  body('cells.*.status').optional({ nullable: true }).isInt({ min: 1, max: 8 }),
  body('overtimeHours').optional().isFloat({ min: 0 }),
  body('nightAllowance').optional().isFloat({ min: 0 }),
  body('punctualityAward').optional().isFloat({ min: 0 }),
];

export const bulkMarkValidation = [
  body('clientId').isUUID(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000, max: 2100 }),
  body('action').isIn(['mark_sundays', 'mark_all_present', 'clear_unmarked']),
  body('status').optional({ nullable: true }).isInt({ min: 1, max: 8 }),
];

export const importValidation = [
  body('clientId').isUUID(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000, max: 2100 }),
];

export const lockValidation = [
  body('clientId').isUUID(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000, max: 2100 }),
  body('verified').isBoolean(),
];

export const unlockValidation = [
  body('clientId').isUUID(),
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000, max: 2100 }),
  body('reason').isString().trim().isLength({ min: 5 }),
];

export const employeeCalendarValidation = [
  param('employeeId').isUUID(),
  query('month').isInt({ min: 1, max: 12 }).toInt(),
  query('year').isInt({ min: 2000, max: 2100 }).toInt(),
];
