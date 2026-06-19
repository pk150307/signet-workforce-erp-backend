import { validationResult, ValidationChain } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../common/errors';

export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    await Promise.all(validations.map((v) => v.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formatted: Record<string, string[]> = {};
      for (const err of errors.array()) {
        const field = 'path' in err ? String(err.path) : 'general';
        if (!formatted[field]) formatted[field] = [];
        formatted[field].push(err.msg);
      }
      next(new ValidationError(formatted));
      return;
    }

    next();
  };
};

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json(data);
}

export function sendCreated<T>(res: Response, data: T): void {
  res.status(201).json(data);
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}

export function sendId(res: Response, id: string): void {
  res.status(200).json({ id });
}
