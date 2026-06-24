import request from 'supertest';
import { app, loginAsAdmin, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from './helpers/test-app';

describe('Auth API', () => {
  it('rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: DEFAULT_ADMIN_EMAIL, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.title).toBe('Unauthorized');
  });

  it('rejects missing email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: DEFAULT_ADMIN_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.sessionExpiresAt).toBeDefined();
    expect(res.body.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(res.body.roles).toContain('Super Admin');
  });

  it('refreshes token', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: DEFAULT_ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD });

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

  it('returns profile for authenticated user', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(DEFAULT_ADMIN_EMAIL);
    expect(res.body.roles).toContain('Super Admin');
  });

  it('accepts forgot-password without revealing account existence', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: DEFAULT_ADMIN_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('reset link');
  });

  it('rejects weak password on change-password', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: DEFAULT_ADMIN_PASSWORD,
        newPassword: 'weak',
        confirmPassword: 'weak',
      });

    expect(res.status).toBe(400);
  });

  it('rejects invalid reset token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'invalid-token',
        newPassword: 'AdminSignet@456!',
        confirmPassword: 'AdminSignet@456!',
      });

    expect(res.status).toBe(400);
  });
});
