import '../load-env';
import dotenv from 'dotenv';
import path from 'path';

// Redundant safety load — load-env runs first via server.ts import chain
for (const envPath of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
]) {
  dotenv.config({ path: envPath, override: false });
}

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
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secret: required('JWT_SECRET', 'SignetWorkforceERP-SuperSecretKey-ChangeInProduction-2024!@#'),
    issuer: process.env.JWT_ISSUER ?? 'SignetWorkforceERP',
    audience: process.env.JWT_AUDIENCE ?? 'SignetWorkforceERPUsers',
    expiryHours: parseInt(process.env.JWT_EXPIRY_HOURS ?? '8', 10),
    refreshTokenDays: parseInt(process.env.REFRESH_TOKEN_DAYS ?? '7', 10),
    rememberMeDays: parseInt(process.env.REMEMBER_ME_DAYS ?? '30', 10),
    sessionIdleTimeoutMinutes: parseInt(process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? '30', 10),
  },
  auth: {
    maxFailedLoginAttempts: parseInt(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? '5', 10),
    accountLockMinutes: parseInt(process.env.ACCOUNT_LOCK_MINUTES ?? '30', 10),
    passwordHistoryCount: parseInt(process.env.PASSWORD_HISTORY_COUNT ?? '5', 10),
    passwordResetTokenTtlMinutes: parseInt(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? '30', 10),
    passwordExpiryDays: parseInt(process.env.PASSWORD_EXPIRY_DAYS ?? '90', 10),
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:4200',
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    from: process.env.EMAIL_FROM ?? 'noreply@signetcorporateservices.com',
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((o) => o.trim()),
  uploadPath: process.env.UPLOAD_PATH ?? 'uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:5000/uploads',
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucketName: process.env.AWS_BUCKET_NAME,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '200', 10),
  },
} as const;
