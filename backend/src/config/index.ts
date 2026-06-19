import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? '5000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'signet_workforce_erp',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  },
  jwt: {
    secret: required('JWT_SECRET', 'SignetWorkforceERP-SuperSecretKey-ChangeInProduction-2024!@#'),
    issuer: process.env.JWT_ISSUER ?? 'SignetWorkforceERP',
    audience: process.env.JWT_AUDIENCE ?? 'SignetWorkforceERPUsers',
    expiryHours: parseInt(process.env.JWT_EXPIRY_HOURS ?? '8', 10),
    refreshTokenDays: parseInt(process.env.REFRESH_TOKEN_DAYS ?? '7', 10),
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((o) => o.trim()),
  uploadPath: process.env.UPLOAD_PATH ?? 'uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:5000/uploads',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '200', 10),
  },
} as const;
