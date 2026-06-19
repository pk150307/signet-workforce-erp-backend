import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticatedUser } from '../types';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export function generateAccessToken(user: {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  roles: string[];
  permissions: string[];
}): string {
  const payload: TokenPayload = {
    sub: user.id,
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

export function getRefreshTokenExpiryDate(): Date {
  const expires = new Date();
  expires.setDate(expires.getDate() + config.jwt.refreshTokenDays);
  return expires;
}
