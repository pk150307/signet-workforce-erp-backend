import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../common/errors';
import { verifyAccessToken } from '../utils/jwt';

export function traceIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.traceId = (req.headers['x-request-id'] as string) ?? uuidv4();
  next();
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError());
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Invalid or expired token.'));
      return;
    }
    next(error);
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    if (roles.length === 0) {
      next();
      return;
    }

    const hasRole = req.user.roles.some((r) =>
      roles.some((allowed) => r.toLowerCase() === allowed.toLowerCase()),
    );

    if (!hasRole) {
      next(new UnauthorizedError('Insufficient permissions.'));
      return;
    }

    next();
  };
}

export function authorizePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const hasPermission = req.user.permissions.some((p) =>
      permissions.some((allowed) => p.toLowerCase() === allowed.toLowerCase()),
    );

    if (!hasPermission && !req.user.roles.includes('Super Admin')) {
      next(new UnauthorizedError('Insufficient permissions.'));
      return;
    }

    next();
  };
}
