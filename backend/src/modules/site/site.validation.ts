import { body, param, query } from 'express-validator';

export const listSitesValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 500 }).toInt(),
  query('search').optional().isString().trim(),
  query('clientId').optional().isUUID(),
  query('isActive').optional().isBoolean().toBoolean(),
];

export const siteIdValidation = [param('id').isUUID().withMessage('Valid site ID is required')];

const siteBodyFields = [
  body('clientId').isUUID().withMessage('Valid client ID is required'),
  body('siteName').notEmpty().isString().trim().isLength({ max: 300 }),
  body('description').optional({ nullable: true }).isString().trim(),
  body('address').notEmpty().isString().trim(),
  body('city').notEmpty().isString().trim().isLength({ max: 100 }),
  body('state').notEmpty().isString().trim().isLength({ max: 100 }),
  body('pinCode').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('contactPerson').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('contactPhone').optional({ nullable: true }).isString().trim().isLength({ max: 30 }),
  body('contactEmail').optional({ nullable: true }).isEmail(),
  body('requiredHeadcount').optional().isInt({ min: 0 }).toInt(),
  body('billingRatePerDay').optional({ nullable: true }).isFloat({ min: 0 }),
  body('billingRatePerMonth').optional({ nullable: true }).isFloat({ min: 0 }),
  body('isActive').optional().isBoolean(),
];

export const createSiteValidation = [...siteBodyFields];

export const updateSiteValidation = [...siteIdValidation, ...siteBodyFields];
