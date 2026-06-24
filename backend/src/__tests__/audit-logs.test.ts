import request from 'supertest';
import { app, loginAsAdmin, authHeader } from './helpers/test-app';

describe('Audit Logs API', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/audit-logs');
    expect(res.status).toBe(401);
  });

  it('lists audit logs for super admin', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/audit-logs').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('returns audit log summary', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/audit-logs/summary').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.totalLogs).toBeDefined();
    expect(res.body.byModule).toBeDefined();
    expect(res.body.byAction).toBeDefined();
  });

  it('returns 404 for unknown audit log', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .get('/api/audit-logs/00000000-0000-4000-8000-000000000001')
      .set(authHeader(token));

    expect(res.status).toBe(404);
  });

  it('exports audit logs as csv', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/audit-logs/export').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Created At');
  });
});
