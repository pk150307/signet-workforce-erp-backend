import { authRepository } from './auth.repository';
import { LoginResult, ChangePasswordInput } from './auth.types';
import { UnauthorizedError } from '../../common/errors';
import { generateAccessToken, getRefreshTokenExpiryDate, getTokenExpiryDate } from '../../utils/jwt';
import { generateRefreshToken, hashPassword, verifyPassword } from '../../utils/password';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

export class AuthService {
  private async buildLoginResult(user: {
    id: string;
    username: string;
    email: string;
    full_name: string | null;
    profile_photo_url: string | null;
  }): Promise<Omit<LoginResult, 'accessToken' | 'refreshToken'>> {
    const roles = await authRepository.getUserRoles(user.id);
    const permissions = await authRepository.getUserPermissions(user.id);
    return {
      expiresAt: getTokenExpiryDate().toISOString(),
      userId: user.id,
      userName: user.username,
      email: user.email,
      fullName: user.full_name,
      profilePhotoUrl: user.profile_photo_url,
      roles,
      permissions,
    };
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await authRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('Account is disabled. Please contact your administrator.');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new UnauthorizedError(`Account is locked until ${user.locked_until.toISOString()} UTC.`);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_login_attempts + 1;
      const lockedUntil =
        attempts >= MAX_LOGIN_ATTEMPTS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null;
      await authRepository.updateLoginFailure(user.id, attempts, lockedUntil);
      throw new UnauthorizedError('Invalid email or password.');
    }

    const roles = await authRepository.getUserRoles(user.id);
    const permissions = await authRepository.getUserPermissions(user.id);
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.full_name,
      roles,
      permissions,
    });
    const refreshToken = generateRefreshToken();
    const refreshExpiry = getRefreshTokenExpiryDate();
    await authRepository.updateLoginSuccess(user.id, refreshToken, refreshExpiry);

    const base = await this.buildLoginResult(user);
    return { accessToken, refreshToken, ...base };
  }

  async refreshToken(refreshToken: string): Promise<LoginResult> {
    const user = await authRepository.findByRefreshToken(refreshToken);
    if (!user) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    const roles = await authRepository.getUserRoles(user.id);
    const permissions = await authRepository.getUserPermissions(user.id);
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.full_name,
      roles,
      permissions,
    });
    const newRefreshToken = generateRefreshToken();
    const refreshExpiry = getRefreshTokenExpiryDate();
    await authRepository.updateRefreshToken(user.id, newRefreshToken, refreshExpiry);

    const base = await this.buildLoginResult(user);
    return { accessToken, refreshToken: newRefreshToken, ...base };
  }

  async logout(userId: string): Promise<void> {
    await authRepository.clearRefreshToken(userId);
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    const { query } = await import('../../database/pool');
    const { rows } = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1 AND NOT is_deleted',
      [input.userId],
    );

    const row = rows[0];
    if (!row) {
      throw new UnauthorizedError('User not found.');
    }

    const valid = await verifyPassword(input.currentPassword, row.password_hash);
    if (!valid) {
      throw new UnauthorizedError('Current password is incorrect.');
    }

    const passwordHash = await hashPassword(input.newPassword);
    await authRepository.updatePassword(input.userId, passwordHash);
  }
}

export const authService = new AuthService();
