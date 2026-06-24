import request from 'supertest';
import { app, loginAsAdmin, authHeader } from './helpers/test-app';

describe('Notifications API', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  it('lists notifications for current user', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/notifications').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('returns notification summary with unread count', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/notifications/summary').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBeDefined();
    expect(res.body.totalCount).toBeDefined();
    expect(res.body.byType).toBeDefined();
  });

  it('marks all notifications as read', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).put('/api/notifications/read-all').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.markedCount).toBeDefined();
  });

  it('returns 404 for unknown notification', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .get('/api/notifications/00000000-0000-4000-8000-000000000001')
      .set(authHeader(token));

    expect(res.status).toBe(404);
  });
});
