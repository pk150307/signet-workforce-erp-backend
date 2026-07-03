import { body, param, query } from 'express-validator';
import { BILLING_CYCLE, BILLING_TYPE, GST_TYPE } from './billing.constants';

const billingTypeValues = Object.values(BILLING_TYPE);
const billingCycleValues = Object.values(BILLING_CYCLE);
const gstTypeValues = Object.values(GST_TYPE);

const componentBodyFields = [
  body('components').optional().isArray(),
  body('components.*.billingComponentId').optional().isUUID(),
  body('components.*.isEnabled').optional().isBoolean(),
  body('components.*.sortOrder').optional().isInt({ min: 0 }).toInt(),
  body('components.*.rateOverride').optional({ nullable: true }).isFloat({ min: 0 }),
  body('components.*.pctOverride').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
];

const configurationBodyFields = [
  body('clientId').isUUID().withMessage('Valid client ID is required'),
  body('siteId').isUUID().withMessage('Valid site ID is required'),
  body('billingType').optional().isIn(billingTypeValues),
  body('requiredHeadcount').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body('billingRate').optional({ nullable: true }).isFloat({ min: 0 }),
  body('serviceChargePct').optional().isFloat({ min: 0, max: 100 }),
  body('pfPct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('esicPct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('lwfPct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('gstPct').optional().isFloat({ min: 0, max: 28 }),
  body('gstType').optional().isIn(gstTypeValues),
  body('invoicePrefix').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('billingCycle').optional().isIn(billingCycleValues),
  body('invoiceDueDays').optional().isInt({ min: 1, max: 365 }).toInt(),
  body('invoiceNotes').optional({ nullable: true }).isString().trim(),
  body('sacCode').optional().isString().trim().isLength({ max: 20 }),
  body('natureOfService').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body('contractId').optional({ nullable: true }).isUUID(),
  body('isActive').optional().isBoolean(),
  ...componentBodyFields,
];

export const listBillingConfigurationsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('clientId').optional().isUUID(),
  query('siteId').optional().isUUID(),
  query('isActive').optional().isBoolean().toBoolean(),
  query('search').optional().isString().trim(),
];

export const billingConfigurationIdValidation = [
  param('id').isUUID().withMessage('Valid billing configuration ID is required'),
];

export const billingConfigurationSiteIdValidation = [
  param('siteId').isUUID().withMessage('Valid site ID is required'),
];

export const createBillingConfigurationValidation = [...configurationBodyFields];

export const updateBillingConfigurationValidation = [
  ...billingConfigurationIdValidation,
  ...configurationBodyFields,
];
