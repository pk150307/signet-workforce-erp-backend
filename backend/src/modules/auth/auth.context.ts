import { Request } from 'express';
import { AuthRequestContext } from './auth.types';

export function getAuthContext(req: Request): AuthRequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';

  return {
    ipAddress,
    userAgent: req.headers['user-agent'] ?? '',
    requestId: req.traceId,
  };
}
