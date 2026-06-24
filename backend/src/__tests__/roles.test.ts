import request from 'supertest';
import { app, loginAsAdmin, authHeader } from './helpers/test-app';

describe('Roles API', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/roles');
    expect(res.status).toBe(401);
  });

  it('lists roles for super admin', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/roles').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.some((r: { name: string }) => r.name === 'Super Admin')).toBe(true);
    expect(res.body.items.some((r: { name: string }) => r.name === 'HR Manager')).toBe(true);
  });

  it('returns role detail with permissions', async () => {
    const token = await loginAsAdmin();
    const list = await request(app).get('/api/roles').set(authHeader(token));
    const roleId = list.body.items.find((r: { name: string }) => r.name === 'Super Admin').id;

    const res = await request(app).get(`/api/roles/${roleId}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.permissions.length).toBeGreaterThan(0);
    expect(res.body.permissionIds.length).toBeGreaterThan(0);
  });

  it('lists permissions grouped by module', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .get('/api/permissions?groupByModule=true')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].module).toBeDefined();
    expect(res.body[0].permissions.length).toBeGreaterThan(0);
  });
});
