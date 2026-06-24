import path from 'path';
import dotenv from 'dotenv';

process.env.NODE_ENV = 'test';

for (const envPath of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
]) {
  dotenv.config({ path: envPath, override: false });
}

process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? '2d2fcbec5b674f8dbb2b4b7d8d7f6b4b7d9d9d1c8a4e5f6a';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'SignetWorkforceERP';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'SignetWorkforceERPUsers';
process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_NAME = process.env.DB_NAME ?? 'signet_workforce_erp';
process.env.DB_USER = process.env.DB_USER ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? '';
process.env.DB_SSL = process.env.DB_SSL ?? 'false';
process.env.UPLOAD_PATH = process.env.UPLOAD_PATH ?? '../uploads';
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? 'http://localhost:5000/uploads';
process.env.LOG_LEVEL = 'error';
