export interface UserListItem {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  mobile: string | null;
  roles: string[];
  departmentId: string | null;
  departmentName: string | null;
  employeeId: string | null;
  employeeCode: string | null;
  isActive: boolean;
  status: string;
  accountLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface UserDetail extends UserListItem {
  profilePhotoUrl: string | null;
  isEmailVerified: boolean;
  lastLoginIp: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  passwordExpiresAt: string | null;
  forcePasswordReset: boolean;
  roleIds: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UserFilter {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
  roleId?: string;
  departmentId?: string;
  status?: string;
}

export interface CreateUserInput {
  username?: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  mobile?: string | null;
  employeeId?: string | null;
  departmentId?: string | null;
  roleIds: string[];
  profilePhotoUrl?: string | null;
  isActive?: boolean;
  forcePasswordReset?: boolean;
  createdBy: string;
}

export interface UpdateUserInput {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string | null;
  employeeId?: string | null;
  departmentId?: string | null;
  roleIds?: string[];
  profilePhotoUrl?: string | null;
  isActive?: boolean;
  updatedBy: string;
}

export interface UpdateUserStatusInput {
  id: string;
  isActive: boolean;
  unlockAccount?: boolean;
  updatedBy: string;
}

export interface AdminResetPasswordInput {
  userId: string;
  mode: 'temporary' | 'email';
  temporaryPassword?: string;
  forcePasswordReset?: boolean;
  actorUserId: string;
  actorUsername: string;
  ipAddress?: string;
}

export interface CreateUserResult {
  user: UserDetail;
  temporaryPassword?: string;
}

export type { LoginHistoryItem, LoginHistoryFilter, LoginHistorySummary } from '../login-history/login-history.types';
