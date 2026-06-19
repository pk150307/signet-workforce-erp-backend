export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  userId: string;
  userName: string;
  email: string;
  fullName: string | null;
  profilePhotoUrl: string | null;
  roles: string[];
  permissions: string[];
}

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordInput {
  email: string;
}
