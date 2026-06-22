import { body, param, query } from 'express-validator';
import {
  EMPLOYEE_DOCUMENT_TYPES,
  EmployeeLifecycleStatus,
  EmploymentType,
  Gender,
} from './employee.constants';

const lifecycleValues = Object.values(EmployeeLifecycleStatus).filter((v) => typeof v === 'number');

export const getEmployeesValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('departmentId').optional().isString(),
  query('designationId').optional().isString(),
  query('siteId').optional().isUUID(),
  query('status')
    .optional()
    .custom((value) => {
      if (value === 'all') return true;
      const n = Number(value);
      return Number.isInteger(n) && lifecycleValues.includes(n);
    }),
  query('employmentType').optional().isInt({ min: 1, max: 6 }).toInt(),
  query('sortBy').optional().isString(),
  query('sortDir').optional().isIn(['asc', 'desc']),
];

export const limitValidation = [
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const employeeIdValidation = [param('id').isUUID().withMessage('Valid employee ID is required')];

export const documentIdValidation = [
  ...employeeIdValidation,
  param('documentId').isUUID().withMessage('Valid document ID is required'),
];

const optionalDate = (field: string) =>
  body(field).optional({ values: 'falsy' }).isISO8601();

const optionalDraftFields = [
  body('id').optional().isUUID(),
  body('employeeCode').optional().isString().trim(),
  body('firstName').optional().isString().trim().isLength({ max: 100 }),
  body('lastName').optional().isString().trim().isLength({ max: 100 }),
  body('email').optional().isEmail().isLength({ max: 200 }),
  body('phone').optional().isString().trim().isLength({ max: 20 }),
  body('alternatePhone').optional().isString().trim().isLength({ max: 20 }),
  optionalDate('dateOfBirth'),
  body('gender').optional().isInt({ min: 1, max: 4 }).custom((v) => Object.values(Gender).includes(v)),
  optionalDate('joiningDate'),
  body('employmentType').optional().isInt({ min: 1, max: 6 }),
  body('departmentId').optional().isString(),
  body('designationId').optional().isString(),
  body('designationGradeId').optional().isString(),
  body('reportingManagerId').optional().isUUID(),
  body('siteId').optional().isUUID(),
  body('clientId').optional().isUUID(),
  body('presentAddress').optional().isString(),
  body('permanentAddress').optional().isString(),
  body('city').optional().isString().isLength({ max: 100 }),
  body('state').optional().isString().isLength({ max: 100 }),
  body('pinCode').optional().isString().isLength({ max: 20 }),
  body('basicSalary').optional().isFloat({ min: 0 }),
  body('grossSalary').optional().isFloat({ min: 0 }),
  body('bankName').optional().isString().isLength({ max: 200 }),
  body('accountNumber').optional().isString().isLength({ max: 50 }),
  body('ifscCode').optional().isString().isLength({ max: 20 }),
  body('accountHolderName').optional().isString().isLength({ max: 200 }),
  body('pfNumber').optional().isString().isLength({ max: 50 }),
  body('esiNumber').optional().isString().isLength({ max: 50 }),
  body('esicNumber').optional().isString().isLength({ max: 50 }),
  body('panNumber').optional().isString().isLength({ max: 50 }),
  body('aadhaarNumber').optional().isString().isLength({ max: 20 }),
  body('uanNumber').optional().isString().isLength({ max: 50 }),
  body('emergencyContactName').optional().isString().isLength({ max: 200 }),
  body('emergencyContactRelationship').optional().isString().isLength({ max: 100 }),
  body('emergencyContactPhone').optional().isString().isLength({ max: 20 }),
  body('draftStep').optional().isInt({ min: 0, max: 6 }).toInt(),
];

export const saveDraftValidation = [
  ...optionalDraftFields,
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty when provided'),
  body('phone').optional().notEmpty().withMessage('Phone cannot be empty when provided'),
];

export const updateDraftValidation = [
  ...employeeIdValidation,
  body('id').isUUID(),
  ...saveDraftValidation,
];

const employeeBodyFields = [
  body('firstName').notEmpty().isLength({ max: 100 }),
  body('lastName').notEmpty().isLength({ max: 100 }),
  body('email').isEmail().isLength({ max: 200 }),
  body('phone').notEmpty().isLength({ max: 20 }),
  body('dateOfBirth').isISO8601().toDate(),
  body('gender').isInt({ min: 1, max: 4 }).custom((v) => Object.values(Gender).includes(v)),
  body('joiningDate').isISO8601(),
  body('employmentType').isInt({ min: 1, max: 6 }),
  body('departmentId').notEmpty(),
  body('designationId').notEmpty(),
  body('designationGradeId').optional().isString(),
  body('basicSalary').optional().isFloat({ min: 0 }),
  body('grossSalary').optional().isFloat({ min: 0 }),
];

export const createEmployeeValidation = [...employeeBodyFields];

export const updateEmployeeValidation = [
  ...employeeIdValidation,
  body('id').isUUID(),
  body('firstName').notEmpty().isLength({ max: 100 }),
  body('lastName').notEmpty().isLength({ max: 100 }),
  body('email').optional().isEmail().isLength({ max: 200 }),
  body('phone').notEmpty().isLength({ max: 20 }),
  body('status')
    .optional()
    .isInt({ min: 0, max: 3 })
    .custom((v) => lifecycleValues.includes(v)),
  body('employmentType').isInt({ min: 1, max: 6 }).custom((v) => Object.values(EmploymentType).includes(v)),
  body('departmentId').notEmpty().isString(),
  body('designationId').notEmpty().isString(),
  body('designationGradeId').optional().isString(),
  body('basicSalary').optional().isFloat({ min: 0 }),
  body('grossSalary').optional().isFloat({ min: 0 }),
  optionalDate('dateOfBirth'),
  body('gender').optional().isInt({ min: 1, max: 4 }),
  optionalDate('joiningDate'),
  body('siteId').optional().isUUID(),
  body('clientId').optional().isUUID(),
  body('reportingManagerId').optional().isUUID(),
  body('presentAddress').optional().isString(),
  body('permanentAddress').optional().isString(),
  body('city').optional().isString().isLength({ max: 100 }),
  body('state').optional().isString().isLength({ max: 100 }),
  body('pinCode').optional().isString().isLength({ max: 20 }),
  body('bankName').optional().isString().isLength({ max: 200 }),
  body('accountNumber').optional().isString().isLength({ max: 50 }),
  body('ifscCode').optional().isString().isLength({ max: 20 }),
  body('accountHolderName').optional().isString().isLength({ max: 200 }),
  body('pfNumber').optional().isString().isLength({ max: 50 }),
  body('esiNumber').optional().isString().isLength({ max: 50 }),
  body('esicNumber').optional().isString().isLength({ max: 50 }),
  body('panNumber').optional().isString().isLength({ max: 50 }),
  body('aadhaarNumber').optional().isString().isLength({ max: 20 }),
  body('uanNumber').optional().isString().isLength({ max: 50 }),
  body('emergencyContactName').optional().isString().isLength({ max: 200 }),
  body('emergencyContactRelationship').optional().isString().isLength({ max: 100 }),
  body('emergencyContactPhone').optional().isString().isLength({ max: 20 }),
];

export const markLeftValidation = [
  ...employeeIdValidation,
  body('lastWorkingDate').isISO8601(),
  body('reason').notEmpty().isString().trim(),
  body('remarks').optional().isString().trim(),
];

export const rejoinValidation = [
  ...employeeIdValidation,
  body('joiningDate').isISO8601(),
  body('departmentId').notEmpty(),
  body('designationId').notEmpty(),
  body('siteId').optional().isUUID(),
  body('reportingManagerId').optional().isUUID(),
  body('reuseEmployeeCode').optional().isBoolean(),
  body('basicSalary').optional().isFloat({ min: 0 }),
  body('grossSalary').optional().isFloat({ min: 0 }),
];

export const uploadDocumentValidation = [
  ...employeeIdValidation,
  body('type').optional().isIn(EMPLOYEE_DOCUMENT_TYPES),
  body('label').optional().isString().trim().isLength({ max: 200 }),
];

export const bulkImportValidation = [
  body('rows').optional().isArray({ min: 1 }),
  body().custom((_, { req }) => {
    const rows = req.body?.rows ?? req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('Provide a non-empty rows array.');
    }
    return true;
  }),
];
