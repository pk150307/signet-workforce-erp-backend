import { body, param, query } from 'express-validator';
import { Gender, EmploymentType, EmployeeStatus } from '../../types/enums';

export const getEmployeesValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().isString().trim(),
  query('departmentId').optional().isString(),
  query('designationId').optional().isString(),
  query('siteId').optional().isUUID(),
  query('status').optional().isInt({ min: 1, max: 6 }).toInt(),
  query('employmentType').optional().isInt({ min: 1, max: 6 }).toInt(),
  query('sortBy').optional().isString(),
  query('sortDir').optional().isIn(['asc', 'desc']),
];

export const employeeIdValidation = [param('id').isUUID().withMessage('Valid employee ID is required')];

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
  body('basicSalary').isFloat({ min: 0 }),
  body('grossSalary').isFloat({ min: 0 }),
];

export const createEmployeeValidation = [...employeeBodyFields];

export const updateEmployeeValidation = [
  ...employeeIdValidation,
  body('id').isUUID(),
  body('firstName').notEmpty().isLength({ max: 100 }),
  body('lastName').notEmpty().isLength({ max: 100 }),
  body('phone').notEmpty().isLength({ max: 20 }),
  body('status').isInt({ min: 1, max: 6 }).custom((v) => Object.values(EmployeeStatus).includes(v)),
  body('employmentType').isInt({ min: 1, max: 6 }).custom((v) => Object.values(EmploymentType).includes(v)),
  body('departmentId').notEmpty(),
  body('designationId').notEmpty(),
  body('basicSalary').isFloat({ min: 0 }),
  body('grossSalary').isFloat({ min: 0 }),
];
