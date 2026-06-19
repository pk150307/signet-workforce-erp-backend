import request from 'supertest';
import { app, loginAsAdmin } from './helpers/test-app';

describe('Auth API', () => {
  it('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@signet-erp.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.title).toBe('Unauthorized');
  });

  it('rejects missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Admin@123' });

    expect(res.status).toBe(400);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@signet-erp.com', password: 'Admin@123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.email).toBe('admin@signet-erp.com');
    expect(res.body.roles).toContain('Super Admin');
  });

  it('refreshes token', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@signet-erp.com', password: 'Admin@123' });

    const res = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: login.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it('requires auth for logout', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('logs out successfully', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Logged out');
  });
});
