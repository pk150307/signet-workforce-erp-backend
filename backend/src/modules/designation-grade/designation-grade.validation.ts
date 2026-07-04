import { body, param, query } from 'express-validator';
import { pageSizeQueryValidator } from '../../types';

export const listDesignationGradesValidation = [
  pageSizeQueryValidator,
  query('cursor').optional().isString().trim(),
  query('direction').optional().isIn(['next', 'prev']),
  query('clientId').optional().isString().trim(),
  query('designationId').optional().isString().trim(),
  query('departmentId').optional().isString().trim(),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().toBoolean(),
];

export const designationGradeIdValidation = [
  param('id').notEmpty().isString().trim().isLength({ max: 50 }),
];

export const designationIdParamValidation = [
  param('designationId').notEmpty().isString().trim().isLength({ max: 50 }),
];

const gradeBodyFields = [
  body('designationId').notEmpty().isString().trim(),
  body('gradeCode').notEmpty().isString().trim().isLength({ max: 20 }),
  body('gradeName').notEmpty().isString().trim().isLength({ max: 200 }),
  body('level').optional().isInt({ min: 1, max: 99 }).toInt(),
  body('basicSalary').optional().isFloat({ min: 0 }).toFloat(),
  body('houseRentAllowance').optional().isFloat({ min: 0 }).toFloat(),
  body('specialAllowance').optional().isFloat({ min: 0 }).toFloat(),
  body('isPfApplicable').optional().isBoolean(),
  body('isEsiApplicable').optional().isBoolean(),
  body('employeePfPercentage').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('employeeEsiPercentage').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('employerPfPercentage').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('employerEsiPercentage').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('isLwfApplicable').optional().isBoolean(),
  body('employeeLwfPercentage').optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body('employeeLwfMaxAmount').optional().isFloat({ min: 0 }).toFloat(),
  body('isActive').optional().isBoolean(),
];

export const createDesignationGradeValidation = [...gradeBodyFields];

export const updateDesignationGradeValidation = [...designationGradeIdValidation, ...gradeBodyFields];
