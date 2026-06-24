import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticatedUser } from '../types';

export interface TokenPayload {
  sub: string;
  sid: string;
  email: string;
  name: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export function generateAccessToken(user: {
  id: string;
  sessionId: string;
  email: string;
  username: string;
  fullName: string | null;
  roles: string[];
  permissions: string[];
}): string {
  const payload: TokenPayload = {
    sub: user.id,
    sid: user.sessionId,
    email: user.email,
    name: user.username,
    fullName: user.fullName ?? user.username,
    roles: user.roles,
    permissions: user.permissions,
  };

  return jwt.sign(payload, config.jwt.secret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: `${config.jwt.expiryHours}h`,
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  const decoded = jwt.verify(token, config.jwt.secret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  }) as TokenPayload;

  return {
    userId: decoded.sub,
    sessionId: decoded.sid,
    username: decoded.name,
    email: decoded.email,
    fullName: decoded.fullName,
    roles: decoded.roles ?? [],
    permissions: decoded.permissions ?? [],
  };
}

export function getTokenExpiryDate(): Date {
  const expires = new Date();
  expires.setHours(expires.getHours() + config.jwt.expiryHours);
  return expires;
}

export function getRefreshTokenExpiryDate(rememberMe = false): Date {
  const expires = new Date();
  const days = rememberMe ? config.jwt.rememberMeDays : config.jwt.refreshTokenDays;
  expires.setDate(expires.getDate() + days);
  return expires;
}

export function getSessionExpiryDate(rememberMe = false): Date {
  return getRefreshTokenExpiryDate(rememberMe);
}

export function getPasswordExpiryDate(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + config.auth.passwordExpiryDays);
  return expires;
}

export function getPasswordResetTokenExpiryDate(): Date {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + config.auth.passwordResetTokenTtlMinutes);
  return expires;
}
