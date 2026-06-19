import { Request, Response } from 'express';
import { authService } from './auth.service';
import { sendSuccess } from '../../common/response';

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(req.body.email, req.body.password);
    sendSuccess(res, result);
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    const result = await authService.refreshToken(req.body.refreshToken);
    sendSuccess(res, result);
  }

  async logout(req: Request, res: Response): Promise<void> {
    if (req.user) {
      await authService.logout(req.user.userId);
    }
    sendSuccess(res, { message: 'Logged out successfully.' });
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    await authService.changePassword({
      userId: req.user!.userId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
    });
    sendSuccess(res, { message: 'Password changed successfully.' });
  }

  async forgotPassword(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, {
      message: 'If an account exists with that email, a reset link will be sent.',
    });
  }
}

export const authController = new AuthController();
