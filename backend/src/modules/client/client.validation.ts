import { body, param, query } from 'express-validator';

export const listClientsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().toBoolean(),
];

export const clientIdValidation = [param('id').isUUID().withMessage('Valid client ID is required')];

const clientBodyFields = [
  body('companyName').notEmpty().isString().trim().isLength({ max: 300 }),
  body('contactPerson').notEmpty().isString().trim().isLength({ max: 200 }),
  body('email').isEmail().isLength({ max: 200 }),
  body('phone').notEmpty().isString().trim().isLength({ max: 30 }),
  body('alternatePhone').optional({ nullable: true }).isString().trim().isLength({ max: 30 }),
  body('website').optional({ nullable: true }).isString().trim().isLength({ max: 300 }),
  body('address').notEmpty().isString().trim(),
  body('city').notEmpty().isString().trim().isLength({ max: 100 }),
  body('state').notEmpty().isString().trim().isLength({ max: 100 }),
  body('pinCode').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('gstNumber').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('panNumber').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('notes').optional({ nullable: true }).isString().trim(),
  body('isActive').optional().isBoolean(),
];

export const createClientValidation = [...clientBodyFields];

export const updateClientValidation = [...clientIdValidation, ...clientBodyFields];

export const clientSitesValidation = [
  ...clientIdValidation,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
];
