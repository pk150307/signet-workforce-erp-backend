import request from 'supertest';
import { createApp } from '../../app';
import { DEFAULT_ADMIN } from '../../scripts/seed-auth';
import { TEST_HR_MANAGER } from './test-seed';

export const app = createApp();

export const DEFAULT_ADMIN_EMAIL = DEFAULT_ADMIN.email;
export const DEFAULT_ADMIN_PASSWORD = DEFAULT_ADMIN.password;

export async function loginAsAdmin(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });

  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.accessToken as string;
}

export async function loginAsHrManager(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_HR_MANAGER.email, password: TEST_HR_MANAGER.password });

  if (res.status !== 200) {
    throw new Error(`HR Manager login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return res.body.accessToken as string;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
