import { config } from '../../config';
import { AppError, UnauthorizedError } from '../../common/errors';
import {
  generateAccessToken,
  getPasswordResetTokenExpiryDate,
  getRefreshTokenExpiryDate,
  getSessionExpiryDate,
  getTokenExpiryDate,
} from '../../utils/jwt';
import { generateRefreshToken, hashPassword, verifyPassword } from '../../utils/password';
import { validatePasswordPolicy } from '../../utils/password-policy';
import { generateSecureToken, hashToken } from '../../utils/token-hash';
import { parseUserAgent } from '../../utils/user-agent';
import { sendPasswordResetEmail } from '../../services/email.service';
import { writeAuditLog, AUDIT_ACTION } from '../iam/audit.service';
import { LOGIN_STATUS, NOTIFICATION_PRIORITY, NOTIFICATION_TYPE } from '../iam/iam.constants';
import { notificationService } from '../notification/notification.service';
import { resolveFileUrl } from '../documents/upload.config';
import { authRepository } from './auth.repository';
import {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  LoginResult,
  RefreshTokenInput,
  ResetPasswordInput,
  UserProfile,
} from './auth.types';

function displayName(user: {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  username: string;
}): string | null {
  const fromParts = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return fromParts || user.full_name || user.username;
}

export class AuthService {
  private async buildLoginResult(
    user: Awaited<ReturnType<typeof authRepository.findById>>,
    sessionExpiresAt: Date,
  ): Promise<Omit<LoginResult, 'accessToken' | 'refreshToken'>> {
    if (!user) {
      throw new UnauthorizedError('User not found.');
    }

    const roles = await authRepository.getUserRoles(user.id);
    const permissions = await authRepository.getUserPermissions(user.id);

    return {
      expiresAt: getTokenExpiryDate().toISOString(),
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      userId: user.id,
      userName: user.username,
      email: user.email,
      fullName: displayName(user),
      profilePhotoUrl: resolveFileUrl(user.profile_photo_url) || null,
      roles,
      permissions,
      forcePasswordReset: user.force_password_reset,
    };
  }

  private deviceFingerprint(parsed: ReturnType<typeof parseUserAgent>, ip: string): string {
    return `${parsed.deviceType}:${parsed.browser ?? 'unknown'}:${parsed.operatingSystem ?? 'unknown'}:${ip}`;
  }

  private isAccountLocked(user: NonNullable<Awaited<ReturnType<typeof authRepository.findByEmail>>>): boolean {
    if (user.account_locked) {
      return true;
    }
    return Boolean(user.locked_until && new Date(user.locked_until) > new Date());
  }

  private async assertPasswordNotReused(userId: string, newPassword: string): Promise<void> {
    const history = await authRepository.getPasswordHistory(userId, config.auth.passwordHistoryCount);
    for (const oldHash of history) {
      if (await verifyPassword(newPassword, oldHash)) {
        throw new AppError(400, 'You cannot reuse a recent password.');
      }
    }
  }

  private async issueTokens(
    user: NonNullable<Awaited<ReturnType<typeof authRepository.findById>>>,
    rememberMe: boolean,
    context: LoginInput['context'],
  ): Promise<LoginResult> {
    const parsed = parseUserAgent(context.userAgent);
    const sessionExpiresAt = getSessionExpiryDate(rememberMe);
    const refreshExpiresAt = getRefreshTokenExpiryDate(rememberMe);

    const sessionId = await authRepository.createSession({
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      deviceType: parsed.deviceType,
      expiresAt: sessionExpiresAt,
      rememberMe,
      createdBy: user.username,
    });

    const refreshToken = generateRefreshToken();
    await authRepository.createRefreshToken({
      userId: user.id,
      sessionId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      rememberMe,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      createdBy: user.username,
    });

    const roles = await authRepository.getUserRoles(user.id);
    const permissions = await authRepository.getUserPermissions(user.id);
    const accessToken = generateAccessToken({
      id: user.id,
      sessionId,
      email: user.email,
      username: user.username,
      fullName: displayName(user),
      roles,
      permissions,
    });

    await authRepository.updateLoginSuccess(user.id, context.ipAddress);

    const fingerprint = this.deviceFingerprint(parsed, context.ipAddress);
    const isNewDevice = !(await authRepository.hasKnownDevice(user.id, fingerprint));

    await authRepository.recordLoginHistory({
      userId: user.id,
      sessionId,
      emailAttempted: user.email,
      loginStatus: LOGIN_STATUS.SUCCESS,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      deviceType: fingerprint,
      isNewDevice,
    });

    await writeAuditLog({
      userId: user.id,
      module: 'Auth',
      action: AUDIT_ACTION.LOGIN,
      entityType: 'user',
      entityId: user.id,
      newValues: { sessionId, rememberMe, isNewDevice },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      requestId: context.requestId,
      createdBy: user.username,
    });

    if (isNewDevice) {
      await notificationService.create({
        userId: user.id,
        title: 'New device sign-in',
        message: `Your account was accessed from a new device (${parsed.browser ?? 'unknown browser'} on ${parsed.operatingSystem ?? 'unknown OS'}).`,
        link: '/settings/login-history',
        notificationType: NOTIFICATION_TYPE.LOGIN_NEW_DEVICE,
        referenceType: 'session',
        referenceId: sessionId,
        priority: NOTIFICATION_PRIORITY.HIGH,
        createdBy: 'System',
      });
    }

    const base = await this.buildLoginResult(user, sessionExpiresAt);
    return { accessToken, refreshToken, ...base };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const parsed = parseUserAgent(input.context.userAgent);
    const user = await authRepository.findByEmail(input.email);

    if (!user) {
      await authRepository.recordLoginHistory({
        userId: null,
        sessionId: null,
        emailAttempted: input.email,
        loginStatus: LOGIN_STATUS.FAILED,
        failureReason: 'invalid_credentials',
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
        browser: parsed.browser,
        operatingSystem: parsed.operatingSystem,
        deviceType: parsed.deviceType,
        isNewDevice: false,
      });
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('Account is disabled. Please contact your administrator.');
    }

    if (this.isAccountLocked(user)) {
      await authRepository.recordLoginHistory({
        userId: user.id,
        sessionId: null,
        emailAttempted: input.email,
        loginStatus: LOGIN_STATUS.LOCKED,
        failureReason: 'account_locked',
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
        browser: parsed.browser,
        operatingSystem: parsed.operatingSystem,
        deviceType: parsed.deviceType,
        isNewDevice: false,
      });
      throw new UnauthorizedError('Account is locked. Please try again later or contact your administrator.');
    }

    const valid = await verifyPassword(input.password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_login_attempts + 1;
      const lockedUntil =
        attempts >= config.auth.maxFailedLoginAttempts
          ? new Date(Date.now() + config.auth.accountLockMinutes * 60 * 1000)
          : null;
      await authRepository.updateLoginFailure(user.id, attempts, lockedUntil);
      await authRepository.recordLoginHistory({
        userId: user.id,
        sessionId: null,
        emailAttempted: input.email,
        loginStatus: lockedUntil ? LOGIN_STATUS.LOCKED : LOGIN_STATUS.FAILED,
        failureReason: 'invalid_credentials',
        ipAddress: input.context.ipAddress,
        userAgent: input.context.userAgent,
        browser: parsed.browser,
        operatingSystem: parsed.operatingSystem,
        deviceType: parsed.deviceType,
        isNewDevice: false,
      });
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (user.password_expires_at && new Date(user.password_expires_at) < new Date()) {
      await authRepository.setForcePasswordReset(user.id, true);
      user.force_password_reset = true;
    }

    return this.issueTokens(user, Boolean(input.rememberMe), input.context);
  }

  async refreshToken(input: RefreshTokenInput): Promise<LoginResult> {
    const tokenRow = await authRepository.findRefreshToken(input.refreshToken);
    if (!tokenRow) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    const user = await authRepository.findById(tokenRow.user_id);
    if (!user || !user.is_active) {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    if (tokenRow.session_id) {
      const session = await authRepository.findActiveSession(tokenRow.session_id);
      if (!session) {
        throw new UnauthorizedError('Session has expired. Please sign in again.');
      }

      const idleLimitMs = config.jwt.sessionIdleTimeoutMinutes * 60 * 1000;
      if (Date.now() - new Date(session.last_activity_at).getTime() > idleLimitMs) {
        await authRepository.endSession(session.id, 'idle_timeout');
        throw new UnauthorizedError('Session timed out due to inactivity. Please sign in again.');
      }

      await authRepository.touchSession(session.id);
    } else {
      throw new UnauthorizedError('Invalid or expired refresh token.');
    }

    await authRepository.revokeRefreshToken(tokenRow.id);

    const sessionId = tokenRow.session_id;
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = getRefreshTokenExpiryDate(false);
    await authRepository.createRefreshToken({
      userId: user.id,
      sessionId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      rememberMe: false,
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
      createdBy: user.username,
    });

    const roles = await authRepository.getUserRoles(user.id);
    const permissions = await authRepository.getUserPermissions(user.id);
    const accessToken = generateAccessToken({
      id: user.id,
      sessionId,
      email: user.email,
      username: user.username,
      fullName: displayName(user),
      roles,
      permissions,
    });

    const session = await authRepository.findActiveSession(sessionId);
    const sessionExpiresAt = session?.expires_at ?? getSessionExpiryDate(false);
    const base = await this.buildLoginResult(user, sessionExpiresAt);
    return { accessToken, refreshToken, ...base };
  }

  async logout(userId: string, sessionId: string, context: LoginInput['context']): Promise<void> {
    await authRepository.closeSessionLogin(sessionId);
    await authRepository.endSession(sessionId, 'logout');
    const parsed = parseUserAgent(context.userAgent);
    await authRepository.recordLoginHistory({
      userId,
      sessionId,
      emailAttempted: null,
      loginStatus: LOGIN_STATUS.LOGOUT,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      deviceType: parsed.deviceType,
      isNewDevice: false,
    });
    await writeAuditLog({
      userId,
      module: 'Auth',
      action: AUDIT_ACTION.LOGOUT,
      entityType: 'user',
      entityId: userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      requestId: context.requestId,
    });
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    const user = await authRepository.findById(input.userId);
    if (!user) {
      throw new UnauthorizedError('User not found.');
    }

    const valid = await verifyPassword(input.currentPassword, user.password_hash);
    if (!valid) {
      throw new UnauthorizedError('Current password is incorrect.');
    }

    const policy = validatePasswordPolicy(input.newPassword);
    if (!policy.valid) {
      throw new AppError(400, policy.errors[0]);
    }

    if (await verifyPassword(input.newPassword, user.password_hash)) {
      throw new AppError(400, 'New password must be different from the current password.');
    }

    await this.assertPasswordNotReused(input.userId, input.newPassword);

    await authRepository.addPasswordHistory(input.userId, user.password_hash, user.username);
    const passwordHash = await hashPassword(input.newPassword);
    await authRepository.updatePassword(input.userId, passwordHash, { forcePasswordReset: false });

    const parsed = parseUserAgent(input.context.userAgent);
    await writeAuditLog({
      userId: input.userId,
      module: 'Auth',
      action: AUDIT_ACTION.PASSWORD_CHANGE,
      entityType: 'user',
      entityId: input.userId,
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      requestId: input.context.requestId,
      createdBy: user.username,
    });
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await authRepository.findByEmail(input.email);
    if (!user || !user.is_active) {
      return;
    }

    const plainToken = generateSecureToken();
    const expiresAt = getPasswordResetTokenExpiryDate();
    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash: hashToken(plainToken),
      expiresAt,
      requestedIp: input.context.ipAddress,
    });

    const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${encodeURIComponent(plainToken)}`;
    await sendPasswordResetEmail(user.email, resetUrl);

    const parsed = parseUserAgent(input.context.userAgent);
    await writeAuditLog({
      userId: user.id,
      module: 'Auth',
      action: AUDIT_ACTION.FORGOT_PASSWORD,
      entityType: 'user',
      entityId: user.id,
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      requestId: input.context.requestId,
      createdBy: user.username,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const policy = validatePasswordPolicy(input.newPassword);
    if (!policy.valid) {
      throw new AppError(400, policy.errors[0]);
    }

    const tokenRow = await authRepository.findValidPasswordResetToken(input.token);
    if (!tokenRow) {
      throw new AppError(400, 'Invalid or expired reset token.');
    }

    const user = await authRepository.findById(tokenRow.user_id);
    if (!user) {
      throw new AppError(400, 'Invalid or expired reset token.');
    }

    await this.assertPasswordNotReused(user.id, input.newPassword);
    await authRepository.addPasswordHistory(user.id, user.password_hash, user.username);

    const passwordHash = await hashPassword(input.newPassword);
    await authRepository.updatePassword(user.id, passwordHash, { forcePasswordReset: false });
    await authRepository.markPasswordResetTokenUsed(tokenRow.id, input.context.ipAddress);
    await authRepository.revokeAllUserSessions(user.id, 'password_reset');

    const parsed = parseUserAgent(input.context.userAgent);
    await writeAuditLog({
      userId: user.id,
      module: 'Auth',
      action: AUDIT_ACTION.RESET_PASSWORD,
      entityType: 'user',
      entityId: user.id,
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
      browser: parsed.browser,
      operatingSystem: parsed.operatingSystem,
      requestId: input.context.requestId,
      createdBy: user.username,
    });
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError('User not found.');
    }

    const roles = await authRepository.getUserRoles(user.id);
    const permissions = await authRepository.getUserPermissions(user.id);

    return {
      userId: user.id,
      userName: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: displayName(user),
      mobile: user.mobile,
      profilePhotoUrl: resolveFileUrl(user.profile_photo_url) || null,
      employeeId: user.employee_id,
      departmentId: user.department_id,
      roles,
      permissions,
      isActive: user.is_active,
      isEmailVerified: user.is_email_verified,
      lastLoginAt: user.last_login_at?.toISOString() ?? null,
      passwordExpiresAt: user.password_expires_at?.toISOString() ?? null,
      forcePasswordReset: user.force_password_reset,
      accountLocked: this.isAccountLocked(user),
      createdAt: user.created_at.toISOString(),
    };
  }

  async validateSession(sessionId: string): Promise<boolean> {
    const session = await authRepository.findActiveSession(sessionId);
    if (!session) {
      return false;
    }

    const idleLimitMs = config.jwt.sessionIdleTimeoutMinutes * 60 * 1000;
    if (Date.now() - new Date(session.last_activity_at).getTime() > idleLimitMs) {
      await authRepository.endSession(session.id, 'idle_timeout');
      return false;
    }

    await authRepository.touchSession(session.id);
    return true;
  }
}

export const authService = new AuthService();
