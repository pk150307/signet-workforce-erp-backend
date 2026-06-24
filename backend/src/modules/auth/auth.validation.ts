import { body } from 'express-validator';
import { validatePasswordPolicy } from '../../utils/password-policy';

const passwordRules = body('newPassword').custom((value: string) => {
  const result = validatePasswordPolicy(value);
  if (!result.valid) {
    throw new Error(result.errors[0]);
  }
  return true;
});

export const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body('rememberMe').optional().isBoolean().withMessage('rememberMe must be a boolean'),
];

export const refreshTokenValidation = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required'),
];

export const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordRules,
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
];

export const forgotPasswordValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
];

export const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Reset token is required'),
  passwordRules,
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
];
