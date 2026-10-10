import { query } from 'express-validator';

export const formatAttendanceValidation = [
  query('clientId').isUUID().withMessage('Select a client.'),
  query('month').optional({ values: 'falsy' }).isInt({ min: 1, max: 12 }).toInt(),
  query('year').optional({ values: 'falsy' }).isInt({ min: 2000, max: 2100 }).toInt(),
];
