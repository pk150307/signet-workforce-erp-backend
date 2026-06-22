import { body, param, query } from 'express-validator';

export const updateProfileValidation = [
  body('companyName').notEmpty().isString().trim().isLength({ max: 300 }),
  body('legalName').notEmpty().isString().trim().isLength({ max: 300 }),
  body('registrationNumber').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('gstNumber').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('panNumber').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('email').isEmail().isLength({ max: 200 }),
  body('phone').notEmpty().isString().trim().isLength({ max: 30 }),
  body('website').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('address').notEmpty().isString().trim(),
  body('city').notEmpty().isString().trim().isLength({ max: 100 }),
  body('state').notEmpty().isString().trim().isLength({ max: 100 }),
  body('pinCode').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('billingAddress').optional({ nullable: true }).isString().trim(),
  body('billingCity').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('billingState').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
  body('billingPinCode').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('logoUrl').optional({ nullable: true }).isString().trim(),
];

export const listCompanyValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().toBoolean(),
];

export const idParamValidation = [param('id').isUUID().withMessage('Valid ID is required')];
