import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';
import jwt from 'jsonwebtoken';
import { AppError, NotFoundError, ValidationError, UnauthorizedError } from '../common/errors';
import { logger } from '../utils/logger';

interface ErrorResponse {
  status: number;
  title: string;
  errors?: Record<string, string[]>;
  detail?: string | null;
  traceId?: string;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error('Request error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    traceId: req.traceId,
  });

  let response: ErrorResponse;

  if (err instanceof ValidationError) {
    response = {
      status: err.statusCode,
      title: err.message,
      errors: err.errors,
      traceId: req.traceId,
    };
  } else if (err instanceof NotFoundError) {
    response = {
      status: err.statusCode,
      title: 'Not Found',
      detail: err.message,
      traceId: req.traceId,
    };
  } else if (err instanceof UnauthorizedError || err instanceof jwt.JsonWebTokenError) {
    response = {
      status: 401,
      title: 'Unauthorized',
      detail: err.message,
      traceId: req.traceId,
    };
  } else if (err instanceof AppError) {
    response = {
      status: err.statusCode,
      title: err.message,
      errors: err.errors,
      traceId: req.traceId,
    };
  } else if (err instanceof DatabaseError) {
    if (err.code === '23505') {
      response = {
        status: 409,
        title: 'Duplicate record',
        detail: 'A record with the same unique value already exists.',
        traceId: req.traceId,
      };
    } else if (err.code === '23503') {
      response = {
        status: 400,
        title: 'Invalid reference',
        detail: 'Referenced record does not exist.',
        traceId: req.traceId,
      };
    } else {
      response = {
        status: 500,
        title: 'Database error',
        detail: 'An unexpected database error occurred.',
        traceId: req.traceId,
      };
    }
  } else {
    response = {
      status: 500,
      title: 'An unexpected error occurred.',
      traceId: req.traceId,
    };
  }

  res.status(response.status).json(response);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    status: 404,
    title: 'Not Found',
    detail: 'The requested resource was not found.',
  });
}
