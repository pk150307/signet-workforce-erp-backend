import { body, param, query } from 'express-validator';

export const listDesignationsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 500 }).toInt(),
  query('clientId').optional().isString().trim(),
  query('search').optional().isString().trim(),
  query('departmentId').optional().isString().trim(),
  query('gradeCode').optional().isString().trim().isLength({ max: 20 }),
  query('isActive').optional().isBoolean().toBoolean(),
];

export const nextDesignationCodeValidation = [
  query('departmentId').notEmpty().isString().trim().withMessage('departmentId is required'),
];

export const designationIdValidation = [
  param('id').notEmpty().isString().trim().isLength({ max: 50 }),
];

const designationBodyFields = [
  body('designationCode').notEmpty().isString().trim().isLength({ max: 50 }),
  body('designationName').notEmpty().isString().trim().isLength({ max: 200 }),
  body('parentDesignationId').optional({ nullable: true }).isString().trim(),
  body('departmentId').notEmpty().isString().trim(),
  body('description').optional({ nullable: true }).isString().trim(),
  body('isActive').optional().isBoolean(),
];

export const createDesignationValidation = [...designationBodyFields];

export const updateDesignationValidation = [
  ...designationIdValidation,
  body('designationCode').notEmpty().isString().trim().isLength({ max: 50 }),
  body('designationName').notEmpty().isString().trim().isLength({ max: 200 }),
  body('parentDesignationId').optional({ nullable: true }).isString().trim(),
  body('departmentId').optional({ nullable: true }).isString().trim(),
  body('description').optional({ nullable: true }).isString().trim(),
  body('isActive').optional().isBoolean(),
];
