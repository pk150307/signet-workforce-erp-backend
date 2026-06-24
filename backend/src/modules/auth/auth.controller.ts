import { Request, Response } from 'express';
import { authService } from './auth.service';
import { getAuthContext } from './auth.context';
import { sendSuccess } from '../../common/response';

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login({
      email: req.body.email,
      password: req.body.password,
      rememberMe: Boolean(req.body.rememberMe),
      context: getAuthContext(req),
    });
    sendSuccess(res, result);
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    const result = await authService.refreshToken({
      refreshToken: req.body.refreshToken,
      context: getAuthContext(req),
    });
    sendSuccess(res, result);
  }

  async logout(req: Request, res: Response): Promise<void> {
    if (req.user) {
      await authService.logout(req.user.userId, req.user.sessionId, getAuthContext(req));
    }
    sendSuccess(res, { message: 'Logged out successfully.' });
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    await authService.changePassword({
      userId: req.user!.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
      context: getAuthContext(req),
    });
    sendSuccess(res, { message: 'Password changed successfully.' });
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    await authService.forgotPassword({
      email: req.body.email,
      context: getAuthContext(req),
    });
    sendSuccess(res, {
      message: 'If an account exists with that email, a reset link will be sent.',
    });
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    await authService.resetPassword({
      token: req.body.token,
      newPassword: req.body.newPassword,
      context: getAuthContext(req),
    });
    sendSuccess(res, { message: 'Password reset successfully. Please sign in with your new password.' });
  }

  async profile(req: Request, res: Response): Promise<void> {
    const profile = await authService.getProfile(req.user!.userId);
    sendSuccess(res, profile);
  }
}

export const authController = new AuthController();
