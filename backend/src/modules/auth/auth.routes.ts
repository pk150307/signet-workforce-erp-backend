import { Router } from 'express';
import { authController } from './auth.controller';
import {
  changePasswordValidation,
  forgotPasswordValidation,
  loginValidation,
  refreshTokenValidation,
} from './auth.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
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

router.post('/change-password', authenticate, validate(changePasswordValidation), (req, res, next) => {
  authController.changePassword(req, res).catch(next);
});

router.post('/forgot-password', validate(forgotPasswordValidation), (req, res, next) => {
  authController.forgotPassword(req, res).catch(next);
});

export default router;
