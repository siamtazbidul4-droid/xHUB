import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err instanceof AppError ? err.message : 'Internal server error.';

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${statusCode}: ${message}`);

  if (statusCode >= 500) {
    return res.status(statusCode).json({ error: message });
  }

  return res.status(statusCode).json({ error: message });
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  next(new AppError(404, 'The requested resource was not found.'));
}
