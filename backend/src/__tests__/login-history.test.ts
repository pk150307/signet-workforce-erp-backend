import request from 'supertest';
import { app, loginAsAdmin, authHeader } from './helpers/test-app';

describe('Login History API', () => {
  it('requires authentication for global list', async () => {
    const res = await request(app).get('/api/login-history');
    expect(res.status).toBe(401);
  });

  it('lists login history for super admin', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/login-history').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('returns login history summary', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/login-history/summary').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totalLogins).toBeDefined();
    expect(res.body.failedAttempts).toBeDefined();
  });

  it('returns current user login history', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/auth/login-history').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  it('filters by login status', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .get('/api/login-history?loginStatus=success')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.loginStatus).toBe('success');
    }
  });
});
