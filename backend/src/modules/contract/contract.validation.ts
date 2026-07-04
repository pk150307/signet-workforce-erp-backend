import { body, param, query } from 'express-validator';
import { pageSizeQueryValidator } from '../../types';
import { BILLING_CYCLE, BILLING_TYPE, CONTRACT_STATUS } from '../billing/billing.constants';

const billingTypeValues = Object.values(BILLING_TYPE);
const invoiceFrequencyValues = Object.values(BILLING_CYCLE);
const contractStatusValues = Object.values(CONTRACT_STATUS);

const penaltyRuleFields = [
  body('penaltyRules').optional().isArray(),
  body('penaltyRules.*.type').optional().isString().trim().notEmpty(),
  body('penaltyRules.*.description').optional().isString().trim(),
  body('penaltyRules.*.ratePct').optional().isFloat({ min: 0, max: 100 }),
  body('penaltyRules.*.fixedAmount').optional().isFloat({ min: 0 }),
  body('penaltyRules.*.graceDays').optional().isInt({ min: 0 }).toInt(),
];

const contractBodyFields = [
  body('clientId').isUUID().withMessage('Valid client ID is required'),
  body('siteId').optional({ nullable: true }).isUUID(),
  body('contractName').notEmpty().isString().trim().isLength({ max: 300 }),
  body('contractCode').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').optional({ nullable: true }).isISO8601(),
  body('billingType').optional().isIn(billingTypeValues),
  body('billingRate').optional({ nullable: true }).isFloat({ min: 0 }),
  body('pfPct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('esicPct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('serviceChargePct').optional().isFloat({ min: 0, max: 100 }),
  body('lwfPct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body('gstPct').optional().isFloat({ min: 0, max: 28 }),
  body('invoiceFrequency').optional().isIn(invoiceFrequencyValues),
  body('invoicePrefix').optional({ nullable: true }).isString().trim().isLength({ max: 20 }),
  body('invoiceTerms').optional({ nullable: true }).isString().trim(),
  body('contractDocumentUrl').optional({ nullable: true }).isString().trim(),
  body('status').optional().isIn(contractStatusValues),
  body('notes').optional({ nullable: true }).isString().trim(),
  body('syncBillingConfiguration').optional().isBoolean(),
  ...penaltyRuleFields,
];

export const listContractsValidation = [
  pageSizeQueryValidator,
  query('cursor').optional().isString().trim(),
  query('direction').optional().isIn(['next', 'prev']),
  query('clientId').optional().isUUID(),
  query('siteId').optional().isUUID(),
  query('status').optional().isIn(contractStatusValues),
  query('activeOnly').optional().isBoolean().toBoolean(),
  query('search').optional().isString().trim(),
];

export const contractIdValidation = [param('id').isUUID().withMessage('Valid contract ID is required')];

export const contractClientIdValidation = [
  param('clientId').isUUID().withMessage('Valid client ID is required'),
];

export const suggestContractValidation = [
  query('clientId').isUUID().withMessage('Valid client ID is required'),
  query('siteId').optional({ nullable: true }).isUUID(),
];

export const createContractValidation = [...contractBodyFields];

export const updateContractValidation = [...contractIdValidation, ...contractBodyFields];

export const updateContractStatusValidation = [
  ...contractIdValidation,
  body('status').isIn(contractStatusValues),
  body('note').optional().isString().trim(),
  body('syncBillingConfiguration').optional().isBoolean(),
];
