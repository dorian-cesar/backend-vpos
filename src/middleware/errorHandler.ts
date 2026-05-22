/**
 * errorHandler.ts
 * Middleware global de manejo de errores para Express.
 */

import type { ErrorRequestHandler } from 'express';

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

const errorHandler: ErrorRequestHandler = (err: HttpError, _req, res, _next) => {
  const statusCode = err.status ?? err.statusCode ?? 500;

  console.error(`[errorHandler] ${statusCode} — ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Error interno del servidor.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default errorHandler;
