import request from 'supertest';
import { app, loginAsAdmin, loginAsHrManager, authHeader } from './helpers/test-app';

describe('Delete Requests API', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/delete-requests');
    expect(res.status).toBe(401);
  });

  it('lists delete requests for super admin', async () => {
    const token = await loginAsAdmin();
    const res = await request(app).get('/api/delete-requests').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('validates create payload', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .post('/api/delete-requests')
      .set(authHeader(token))
      .send({ module: 'Clients' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown delete request', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .get('/api/delete-requests/00000000-0000-4000-8000-000000000001')
      .set(authHeader(token));

    expect(res.status).toBe(404);
  });

  it('creates and rejects a delete request via API', async () => {
    const adminToken = await loginAsAdmin();
    const hrToken = await loginAsHrManager();
    const entityId = crypto.randomUUID();

    const createRes = await request(app)
      .post('/api/delete-requests')
      .set(authHeader(hrToken))
      .send({
        module: 'Clients',
        entityType: 'Clients',
        entityId,
        entityLabel: 'API Test Client',
        reason: 'End-to-end delete request test via direct API.',
      });

    expect(createRes.status).toBe(201);
    const requestId = createRes.body.id as string;

    const reject = await request(app)
      .put(`/api/delete-requests/${requestId}/reject`)
      .set(authHeader(adminToken))
      .send({ rejectionRemarks: 'Entity not found in the system.' });

    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('rejected');
    expect(reject.body.rejectionRemarks).toContain('not found');
  });

  it('requires rejection remarks on reject', async () => {
    const token = await loginAsAdmin();
    const res = await request(app)
      .put('/api/delete-requests/00000000-0000-4000-8000-000000000001/reject')
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
  });
});
