export interface AuthRequestContext {
  ipAddress: string;
  userAgent: string;
  requestId?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
  context: AuthRequestContext;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  sessionExpiresAt: string;
  userId: string;
  userName: string;
  email: string;
  fullName: string | null;
  profilePhotoUrl: string | null;
  roles: string[];
  permissions: string[];
  forcePasswordReset: boolean;
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  context: AuthRequestContext;
}

export interface ForgotPasswordInput {
  email: string;
  context: AuthRequestContext;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
  context: AuthRequestContext;
}

export interface RefreshTokenInput {
  refreshToken: string;
  context: AuthRequestContext;
}

export interface UserProfile {
  userId: string;
  userName: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  mobile: string | null;
  profilePhotoUrl: string | null;
  employeeId: string | null;
  departmentId: string | null;
  roles: string[];
  permissions: string[];
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  passwordExpiresAt: string | null;
  forcePasswordReset: boolean;
  accountLocked: boolean;
  createdAt: string;
}
