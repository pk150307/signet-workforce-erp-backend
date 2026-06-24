import { config } from '../../config';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors';
import { getPasswordExpiryDate, getPasswordResetTokenExpiryDate } from '../../utils/jwt';
import { hashPassword } from '../../utils/password';
import { validatePasswordPolicy } from '../../utils/password-policy';
import { generateSecureToken, hashToken } from '../../utils/token-hash';
import { sendPasswordResetEmail } from '../../services/email.service';
import { authRepository } from '../auth/auth.repository';
import { writeAuditLog, AUDIT_ACTION } from '../iam/audit.service';
import { IAM_SYSTEM_ROLES, NOTIFICATION_TYPE } from '../iam/iam.constants';
import { notificationService } from '../notification/notification.service';
import { usersRepository } from './users.repository';
import { loginHistoryService } from '../login-history/login-history.service';
import { LoginHistoryFilter } from '../login-history/login-history.types';
import {
  AdminResetPasswordInput,
  CreateUserInput,
  CreateUserResult,
  UpdateUserInput,
  UpdateUserStatusInput,
  UserDetail,
  UserFilter,
} from './users.types';
import { deriveUsername, generateCompliantPassword } from './users.utils';

export class UsersService {
  private async assertCanAssignRoles(
    roleIds: string[],
    actorRoles: string[],
  ): Promise<void> {
    const roleNames = await usersRepository.getRoleNames(roleIds);
    const assigningSuperAdmin = roleNames.includes(IAM_SYSTEM_ROLES.SUPER_ADMIN);
    if (assigningSuperAdmin && !actorRoles.includes(IAM_SYSTEM_ROLES.SUPER_ADMIN)) {
      throw new ForbiddenError('Only Super Admin can assign the Super Admin role.');
    }
  }

  private async assertNotLastSuperAdmin(userId: string, nextRoleIds?: string[]): Promise<void> {
    const isSuperAdmin = await usersRepository.userHasRole(userId, IAM_SYSTEM_ROLES.SUPER_ADMIN);
    if (!isSuperAdmin) return;

    if (nextRoleIds) {
      const nextRoleNames = await usersRepository.getRoleNames(nextRoleIds);
      if (nextRoleNames.includes(IAM_SYSTEM_ROLES.SUPER_ADMIN)) return;
    }

    const remaining = await usersRepository.countActiveSuperAdmins(userId);
    if (remaining === 0) {
      throw new AppError(400, 'Cannot remove or deactivate the last active Super Admin.');
    }
  }

  private async uniqueUsername(base: string, excludeId?: string): Promise<string> {
    let candidate = base;
    let suffix = 1;
    while (await usersRepository.usernameExists(candidate, excludeId)) {
      candidate = `${base}${suffix}`.slice(0, 100);
      suffix++;
    }
    return candidate;
  }

  async list(filter: UserFilter) {
    return usersRepository.findAll(filter);
  }

  async getById(id: string): Promise<UserDetail> {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }
    return user;
  }

  async create(
    input: CreateUserInput,
    actor: { userId: string; username: string; roles: string[] },
  ): Promise<CreateUserResult> {
    if (await usersRepository.emailExists(input.email)) {
      throw new ConflictError(`A user with email '${input.email}' already exists.`);
    }

    await this.assertCanAssignRoles(input.roleIds, actor.roles);

    const baseUsername = input.username ?? deriveUsername(input.email, input.firstName, input.lastName);
    const username = await this.uniqueUsername(baseUsername);

    let temporaryPassword: string | undefined;
    let plainPassword = input.password;
    if (!plainPassword) {
      temporaryPassword = generateCompliantPassword();
      plainPassword = temporaryPassword;
    }

    const policy = validatePasswordPolicy(plainPassword);
    if (!policy.valid) {
      throw new AppError(400, policy.errors[0]);
    }

    const passwordHash = await hashPassword(plainPassword);
    const userId = await usersRepository.create({
      ...input,
      username,
      passwordHash,
      passwordExpiresAt: getPasswordExpiryDate(),
      forcePasswordReset: input.forcePasswordReset ?? !input.password,
    });

    await usersRepository.setRoles(userId, input.roleIds, actor.username);
    await authRepository.addPasswordHistory(userId, passwordHash, actor.username);

    const user = (await usersRepository.findById(userId))!;

    await notificationService.create({
      userId,
      title: 'Welcome to Signet Workforce ERP',
      message: 'Your account has been created. Please sign in and change your password.',
      link: '/auth/login',
      notificationType: NOTIFICATION_TYPE.USER_CREATED,
      referenceType: 'user',
      referenceId: userId,
      createdBy: actor.username,
    });

    await writeAuditLog({
      userId: actor.userId,
      module: 'Users',
      action: AUDIT_ACTION.USER_CREATE,
      entityType: 'user',
      entityId: userId,
      newValues: {
        email: user.email,
        roles: user.roles,
        isActive: user.isActive,
      },
      createdBy: actor.username,
    });

    return { user, temporaryPassword };
  }

  async update(
    input: UpdateUserInput,
    actor: { userId: string; username: string; roles: string[] },
  ): Promise<UserDetail> {
    const existing = await usersRepository.findById(input.id);
    if (!existing) {
      throw new NotFoundError('User', input.id);
    }

    if (input.email && (await usersRepository.emailExists(input.email, input.id))) {
      throw new ConflictError(`A user with email '${input.email}' already exists.`);
    }

    if (input.roleIds) {
      await this.assertCanAssignRoles(input.roleIds, actor.roles);
      await this.assertNotLastSuperAdmin(input.id, input.roleIds);
      await usersRepository.setRoles(input.id, input.roleIds, actor.username);

      await writeAuditLog({
        userId: actor.userId,
        module: 'Users',
        action: AUDIT_ACTION.ROLE_CHANGE,
        entityType: 'user',
        entityId: input.id,
        oldValues: { roles: existing.roles },
        newValues: { roles: await usersRepository.getRoleNames(input.roleIds) },
        createdBy: actor.username,
      });
    }

    if (input.isActive === false) {
      await this.assertNotLastSuperAdmin(input.id);
    }

    await usersRepository.update(input);

    const updated = (await usersRepository.findById(input.id))!;

    await writeAuditLog({
      userId: actor.userId,
      module: 'Users',
      action: AUDIT_ACTION.USER_UPDATE,
      entityType: 'user',
      entityId: input.id,
      oldValues: {
        email: existing.email,
        firstName: existing.firstName,
        lastName: existing.lastName,
        isActive: existing.isActive,
      },
      newValues: {
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        isActive: updated.isActive,
      },
      createdBy: actor.username,
    });

    return updated;
  }

  async updateStatus(
    input: UpdateUserStatusInput,
    actor: { userId: string; username: string },
  ): Promise<UserDetail> {
    const existing = await usersRepository.findById(input.id);
    if (!existing) {
      throw new NotFoundError('User', input.id);
    }

    if (!input.isActive) {
      await this.assertNotLastSuperAdmin(input.id);
    }

    await usersRepository.updateStatus(input);

    if (!input.isActive) {
      await authRepository.revokeAllUserSessions(input.id, 'account_disabled');
    }

    const updated = (await usersRepository.findById(input.id))!;

    await writeAuditLog({
      userId: actor.userId,
      module: 'Users',
      action: AUDIT_ACTION.USER_UPDATE,
      entityType: 'user',
      entityId: input.id,
      oldValues: {
        isActive: existing.isActive,
        accountLocked: existing.accountLocked,
      },
      newValues: {
        isActive: updated.isActive,
        accountLocked: updated.accountLocked,
        unlocked: input.unlockAccount ?? false,
      },
      createdBy: actor.username,
    });

    return updated;
  }

  async resetPassword(input: AdminResetPasswordInput): Promise<{ temporaryPassword?: string; message: string }> {
    const user = await usersRepository.findById(input.userId);
    if (!user) {
      throw new NotFoundError('User', input.userId);
    }

    const forceReset = input.forcePasswordReset ?? true;

    if (input.mode === 'email') {
      const plainToken = generateSecureToken();
      await authRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash: hashToken(plainToken),
        expiresAt: getPasswordResetTokenExpiryDate(),
        requestedIp: input.ipAddress ?? null,
      });

      const resetUrl = `${config.frontendUrl}/auth/reset-password?token=${encodeURIComponent(plainToken)}`;
      await sendPasswordResetEmail(user.email, resetUrl);
      await authRepository.revokeAllUserSessions(user.id, 'admin_password_reset');

      await writeAuditLog({
        userId: input.actorUserId,
        module: 'Users',
        action: AUDIT_ACTION.RESET_PASSWORD,
        entityType: 'user',
        entityId: user.id,
        newValues: { mode: 'email' },
        ipAddress: input.ipAddress ?? null,
        createdBy: input.actorUsername,
      });

      return { message: 'Password reset email sent successfully.' };
    }

    let temporaryPassword = input.temporaryPassword;
    if (!temporaryPassword) {
      temporaryPassword = generateCompliantPassword();
    }

    const policy = validatePasswordPolicy(temporaryPassword);
    if (!policy.valid) {
      throw new AppError(400, policy.errors[0]);
    }

    const passwordHash = await hashPassword(temporaryPassword);
    await authRepository.addPasswordHistory(
      user.id,
      (await authRepository.findById(user.id))!.password_hash,
      input.actorUsername,
    );
    await authRepository.updatePassword(user.id, passwordHash, { forcePasswordReset: forceReset });
    await authRepository.revokeAllUserSessions(user.id, 'admin_password_reset');

    await notificationService.create({
      userId: user.id,
      title: 'Password reset by administrator',
      message: 'Your password was reset. Sign in with your new temporary password.',
      link: '/auth/login',
      notificationType: NOTIFICATION_TYPE.PASSWORD_RESET,
      referenceType: 'user',
      referenceId: user.id,
      createdBy: input.actorUsername,
    });

    await writeAuditLog({
      userId: input.actorUserId,
      module: 'Users',
      action: AUDIT_ACTION.RESET_PASSWORD,
      entityType: 'user',
      entityId: user.id,
      newValues: { mode: 'temporary', forcePasswordReset: forceReset },
      ipAddress: input.ipAddress ?? null,
      createdBy: input.actorUsername,
    });

    return {
      temporaryPassword,
      message: 'Temporary password set successfully.',
    };
  }

  async getLoginHistory(userId: string, filter: LoginHistoryFilter) {
    return loginHistoryService.listForUser(userId, filter);
  }
}

export const usersService = new UsersService();
