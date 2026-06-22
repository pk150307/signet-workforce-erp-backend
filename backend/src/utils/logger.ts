import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const consoleFormat = config.isProduction
  ? winston.format.combine(winston.format.timestamp(), winston.format.simple())
  : winston.format.combine(winston.format.colorize(), winston.format.timestamp(), winston.format.simple());

export const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'signet-workforce-erp' },
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
  ],
});

export function logUncaughtExceptions(): void {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('[startup] Unhandled rejection:', message);
    logger.error('Unhandled rejection', { reason: message });
    process.exit(1);
  });
}
