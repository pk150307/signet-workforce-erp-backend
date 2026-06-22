import { body, param, query } from 'express-validator';

export const listDepartmentsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 500 }).toInt(),
  query('clientId').optional().isString().trim(),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean().toBoolean(),
];

export const nextDepartmentCodeValidation = [
  query('clientId').notEmpty().isString().trim().withMessage('clientId is required'),
];

export const departmentIdValidation = [
  param('id').notEmpty().isString().trim().isLength({ max: 50 }),
];

const departmentBodyFields = [
  body('clientId').notEmpty().isString().trim(),
  body('departmentCode').notEmpty().isString().trim().isLength({ max: 50 }),
  body('departmentName').notEmpty().isString().trim().isLength({ max: 200 }),
  body('parentDepartmentId').optional({ nullable: true }).isString().trim(),
  body('description').optional({ nullable: true }).isString().trim(),
  body('headOfDepartmentId').optional({ nullable: true }).isString().trim(),
  body('isActive').optional().isBoolean(),
];

export const createDepartmentValidation = [...departmentBodyFields];

export const updateDepartmentValidation = [
  ...departmentIdValidation,
  body('departmentCode').notEmpty().isString().trim().isLength({ max: 50 }),
  body('departmentName').notEmpty().isString().trim().isLength({ max: 200 }),
  body('parentDepartmentId').optional({ nullable: true }).isString().trim(),
  body('description').optional({ nullable: true }).isString().trim(),
  body('headOfDepartmentId').optional({ nullable: true }).isString().trim(),
  body('isActive').optional().isBoolean(),
];
