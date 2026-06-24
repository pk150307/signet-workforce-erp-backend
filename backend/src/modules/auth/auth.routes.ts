import { Router } from 'express';
import { authController } from './auth.controller';
import {
  changePasswordValidation,
  forgotPasswordValidation,
  loginValidation,
  refreshTokenValidation,
  resetPasswordValidation,
} from './auth.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';
import { loginHistoryController } from '../login-history/login-history.controller';
import { listLoginHistoryValidation } from '../login-history/login-history.validation';

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 */
router.post('/login', validate(loginValidation), (req, res, next) => {
  authController.login(req, res).catch(next);
});

router.post('/refresh-token', validate(refreshTokenValidation), (req, res, next) => {
  authController.refreshToken(req, res).catch(next);
});

router.post('/logout', authenticate, (req, res, next) => {
  authController.logout(req, res).catch(next);
});

router.get('/profile', authenticate, (req, res, next) => {
  authController.profile(req, res).catch(next);
});

router.get('/login-history', authenticate, validate(listLoginHistoryValidation), (req, res, next) => {
  loginHistoryController.myHistory(req, res).catch(next);
});

router.get('/login-history/summary', authenticate, (req, res, next) => {
  loginHistoryController.mySummary(req, res).catch(next);
});

router.post('/change-password', authenticate, validate(changePasswordValidation), (req, res, next) => {
  authController.changePassword(req, res).catch(next);
});

router.post('/forgot-password', validate(forgotPasswordValidation), (req, res, next) => {
  authController.forgotPassword(req, res).catch(next);
});

router.post('/reset-password', validate(resetPasswordValidation), (req, res, next) => {
  authController.resetPassword(req, res).catch(next);
});

export default router;
