import request from 'supertest';
import { app, loginAsAdmin, authHeader } from './helpers/test-app';
import { getRoleIdByName, uniqueTestEmail } from './helpers/test-seed';

describe('Users API', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lists users for super admin', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/users').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.totalCount).toBeGreaterThanOrEqual(1);
  });

  it('returns user profile by id', async () => {
    const token = await loginAsAdmin();
    const list = await request(app).get('/api/users').set(authHeader(token));
    const adminUser = list.body.items.find((u: { roles: string[] }) =>
      u.roles?.includes('Super Admin'),
    );
    expect(adminUser).toBeDefined();

    const res = await request(app).get(`/api/users/${adminUser.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(adminUser.id);
    expect(res.body.roles).toContain('Super Admin');
  });

  it('returns login history', async () => {
    const token = await loginAsAdmin();
    const list = await request(app).get('/api/users').set(authHeader(token));
    const userId = list.body.items[0].id as string;

    const res = await request(app)
      .get(`/api/users/${userId}/login-history`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });

  it('creates a user with generated temporary password', async () => {
    const token = await loginAsAdmin();
    const hrRoleId = await getRoleIdByName('HR Manager');
    const email = uniqueTestEmail('users.api');

    const res = await request(app)
      .post('/api/users')
      .set(authHeader(token))
      .send({
        email,
        firstName: 'API',
        lastName: 'User',
        roleIds: [hrRoleId],
        isActive: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.temporaryPassword).toBeDefined();
  });
});
