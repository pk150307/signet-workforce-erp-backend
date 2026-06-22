import { body, param, query } from 'express-validator';

const pfEsicQueryFields = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString(),
  query('siteId').optional().isUUID(),
  query('clientId').optional().isUUID(),
  query('status').optional().isIn(['Active', 'Inactive', 'Pending', 'Suspended']),
  query('employeeStatus')
    .optional()
    .custom((value) => {
      if (value === 'all') return true;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0 && n <= 3;
    }),
  query('department').optional().isString(),
  query('hasUan').optional().isBoolean().toBoolean(),
  query('hasPf').optional().isBoolean().toBoolean(),
  query('hasEsic').optional().isBoolean().toBoolean(),
  query('sortBy').optional().isIn([
    'employeeCode',
    'fullName',
    'department',
    'clientCompanyName',
    'aadhaarNumber',
    'uanNumber',
    'pfNumber',
    'esicNumber',
    'status',
    'effectiveDate',
  ]),
  query('sortDir').optional().isIn(['asc', 'desc']),
  query('pfApplicable').optional().isBoolean().toBoolean(),
  query('esiApplicable').optional().isBoolean().toBoolean(),
];

export const listPfEsicValidation = [...pfEsicQueryFields];

export const exportPfEsicValidation = [
  query('search').optional().isString(),
  query('siteId').optional().isUUID(),
  query('clientId').optional().isUUID(),
  query('status').optional().isIn(['Active', 'Inactive', 'Pending', 'Suspended']),
  query('employeeStatus')
    .optional()
    .custom((value) => {
      if (value === 'all') return true;
      const n = Number(value);
      return Number.isInteger(n) && n >= 0 && n <= 3;
    }),
  query('department').optional().isString(),
  query('hasUan').optional().isBoolean().toBoolean(),
  query('hasPf').optional().isBoolean().toBoolean(),
  query('hasEsic').optional().isBoolean().toBoolean(),
  query('sortBy').optional().isIn([
    'employeeCode',
    'fullName',
    'department',
    'clientCompanyName',
    'aadhaarNumber',
    'uanNumber',
    'pfNumber',
    'esicNumber',
    'status',
    'effectiveDate',
  ]),
  query('sortDir').optional().isIn(['asc', 'desc']),
  query('pfApplicable').optional().isBoolean().toBoolean(),
  query('esiApplicable').optional().isBoolean().toBoolean(),
];

export const employeeIdParamValidation = [
  param('employeeId').isUUID().withMessage('Valid employee ID is required'),
];

const pfEsicBodyFields = [
  body('effectiveDate').optional({ nullable: true }).isISO8601(),
  body('status').optional({ nullable: true }).isIn(['Active', 'Inactive', 'Pending', 'Suspended']),
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
  body('esicNumber').optional({ nullable: true }).isString(),
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
