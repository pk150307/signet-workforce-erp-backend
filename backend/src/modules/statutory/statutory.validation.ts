import { body, param, query } from 'express-validator';

export const listPfEsicValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString(),
  query('siteId').optional().isUUID(),
  query('pfApplicable').optional().isBoolean(),
  query('esiApplicable').optional().isBoolean(),
];

export const employeeIdParamValidation = [
  param('employeeId').isUUID().withMessage('Valid employee ID is required'),
];

const pfEsicBodyFields = [
  body('uanNumber').optional({ nullable: true }).isString(),
  body('pfNumber').optional({ nullable: true }).isString(),
  body('pfJoiningDate').optional({ nullable: true }).isISO8601(),
  body('pfExitDate').optional({ nullable: true }).isISO8601(),
  body('pfNomineeName').optional({ nullable: true }).isString(),
  body('pfNomineeRelation').optional({ nullable: true }).isString(),
  body('pfAccountNumber').optional({ nullable: true }).isString(),
  body('employerPfPercentage').optional().isFloat({ min: 0, max: 100 }),
  body('employeePfPercentage').optional().isFloat({ min: 0, max: 100 }),
  body('isPfApplicable').optional().isBoolean(),
  body('pfRemarks').optional({ nullable: true }).isString(),
  body('esiNumber').optional({ nullable: true }).isString(),
  body('esiDispensary').optional({ nullable: true }).isString(),
  body('esiJoiningDate').optional({ nullable: true }).isISO8601(),
  body('esiExitDate').optional({ nullable: true }).isISO8601(),
  body('isEsiApplicable').optional().isBoolean(),
  body('employerEsiPercentage').optional().isFloat({ min: 0, max: 100 }),
  body('employeeEsiPercentage').optional().isFloat({ min: 0, max: 100 }),
  body('familyMembers').optional().isArray(),
  body('familyMembers.*.name').optional().isString(),
  body('familyMembers.*.relation').optional().isString(),
  body('esiRemarks').optional({ nullable: true }).isString(),
  body('panNumber').optional({ nullable: true }).isString(),
  body('aadhaarNumber').optional({ nullable: true }).isString(),
];

export const upsertPfEsicValidation = [...employeeIdParamValidation, ...pfEsicBodyFields];

export const bulkUpsertPfEsicValidation = [
  body('items').isArray({ min: 1 }),
  body('items.*.employeeId').isUUID(),
  ...pfEsicBodyFields.map((v) => {
    const field = v as unknown as { builder?: { fields?: string[] } };
    return body(`items.*.${String(field).includes('uanNumber') ? 'uanNumber' : ''}`);
  }),
];
