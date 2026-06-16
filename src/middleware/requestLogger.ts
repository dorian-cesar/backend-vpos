/**
 * requestLogger.ts
 * Middleware de logging de requests HTTP con código de color por status.
 */

import type { Request, Response, NextFunction } from 'express';

const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    // Ignorar 404s de rutas que no son de la API (generalmente bots/scanners)
    if (statusCode === 404 && !originalUrl.startsWith('/api')) {
      return;
    }

    const color =
      statusCode >= 500 ? '\x1b[31m'  // rojo
      : statusCode >= 400 ? '\x1b[33m' // amarillo
      : statusCode >= 200 ? '\x1b[32m' // verde
      : '\x1b[0m';

    console.log(
      `${color}[${new Date().toISOString()}] ${method} ${originalUrl} ${statusCode} ${duration}ms — IP: ${ip ?? 'unknown'}\x1b[0m`,
    );
  });

  next();
};

export default requestLogger;
