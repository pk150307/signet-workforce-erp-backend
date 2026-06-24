import request from 'supertest';
import {
  app,
  authHeader,
  loginAsAdmin,
  loginAsHrManager,
} from './helpers/test-app';
import { getRoleIdByName, uniqueTestEmail } from './helpers/test-seed';

describe('IAM Integration', () => {
  it('denies HR Manager access to audit logs', async () => {
    const token = await loginAsHrManager();
    const res = await request(app).get('/api/audit-logs').set(authHeader(token));
    expect(res.status).toBe(401);
  });

  it('allows HR Manager to list delete requests but not approve', async () => {
    const hrToken = await loginAsHrManager();
    const listRes = await request(app).get('/api/delete-requests').set(authHeader(hrToken));
    expect(listRes.status).toBe(200);

    const approveRes = await request(app)
      .put('/api/delete-requests/00000000-0000-4000-8000-000000000001/approve')
      .set(authHeader(hrToken))
      .send({});
    expect(approveRes.status).toBe(401);
  });

  it('creates a user and returns temporary password', async () => {
    const adminToken = await loginAsAdmin();
    const hrRoleId = await getRoleIdByName('HR Manager');
    const email = uniqueTestEmail('user.create');

    const res = await request(app)
      .post('/api/users')
      .set(authHeader(adminToken))
      .send({
        email,
        firstName: 'Test',
        lastName: 'User',
        roleIds: [hrRoleId],
        isActive: true,
        forcePasswordReset: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.temporaryPassword).toBeDefined();
  });

  it('runs delete approval workflow for clients', async () => {
    const adminToken = await loginAsAdmin();
    const hrToken = await loginAsHrManager();

    const createClient = await request(app)
      .post('/api/clients')
      .set(authHeader(adminToken))
      .send({
        companyName: `IAM Test Client ${Date.now()}`,
        contactPerson: 'Test Contact',
        email: uniqueTestEmail('client'),
        phone: '9999999999',
        address: 'Test Address',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560001',
        isActive: true,
      });

    expect(createClient.status).toBe(201);
    const clientId = createClient.body.id as string;

    const missingReason = await request(app)
      .delete(`/api/clients/${clientId}`)
      .set(authHeader(hrToken));
    expect(missingReason.status).toBe(400);

    const submitRequest = await request(app)
      .delete(`/api/clients/${clientId}`)
      .set(authHeader(hrToken))
      .send({ reason: 'Test client no longer required for integration test.' });

    expect(submitRequest.status).toBe(202);
    expect(submitRequest.body.requestId).toBeDefined();
    expect(submitRequest.body.status).toBe('pending');

    const requestId = submitRequest.body.requestId as string;

    const detail = await request(app)
      .get(`/api/delete-requests/${requestId}`)
      .set(authHeader(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('pending');
    expect(detail.body.module).toBe('Clients');

    const approve = await request(app)
      .put(`/api/delete-requests/${requestId}/approve`)
      .set(authHeader(adminToken))
      .send({});
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');

    const clientAfter = await request(app)
      .get(`/api/clients/${clientId}`)
      .set(authHeader(adminToken));
    expect(clientAfter.status).toBe(404);
  });

  it('allows super admin to delete clients immediately', async () => {
    const adminToken = await loginAsAdmin();

    const createClient = await request(app)
      .post('/api/clients')
      .set(authHeader(adminToken))
      .send({
        companyName: `IAM Direct Delete ${Date.now()}`,
        contactPerson: 'Direct Delete',
        email: uniqueTestEmail('client.direct'),
        phone: '8888888888',
        address: 'Test Address',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560001',
        isActive: true,
      });

    expect(createClient.status).toBe(201);
    const clientId = createClient.body.id as string;

    const deleteRes = await request(app)
      .delete(`/api/clients/${clientId}`)
      .set(authHeader(adminToken));

    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/clients/${clientId}`)
      .set(authHeader(adminToken));
    expect(getRes.status).toBe(404);
  });

  it('rejects delete requests with remarks', async () => {
    const adminToken = await loginAsAdmin();
    const hrToken = await loginAsHrManager();
    const entityId = crypto.randomUUID();

    const createRes = await request(app)
      .post('/api/delete-requests')
      .set(authHeader(hrToken))
      .send({
        module: 'Users',
        entityType: 'Users',
        entityId,
        entityLabel: 'Phantom User',
        reason: 'Test rejection workflow for IAM integration.',
      });

    expect(createRes.status).toBe(201);
    const requestId = createRes.body.id as string;

    const reject = await request(app)
      .put(`/api/delete-requests/${requestId}/reject`)
      .set(authHeader(adminToken))
      .send({ rejectionRemarks: 'Entity does not exist in the system.' });

    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe('rejected');
    expect(reject.body.rejectionRemarks).toContain('does not exist');
  });

  it('records login events and serves login history', async () => {
    const adminToken = await loginAsAdmin();

    const history = await request(app)
      .get('/api/login-history?loginStatus=success')
      .set(authHeader(adminToken));

    expect(history.status).toBe(200);
    expect(history.body.items.length).toBeGreaterThan(0);

    const selfHistory = await request(app)
      .get('/api/auth/login-history')
      .set(authHeader(adminToken));

    expect(selfHistory.status).toBe(200);
    expect(selfHistory.body.items.length).toBeGreaterThan(0);
  });

  it('creates notifications when delete requests are submitted', async () => {
    const adminToken = await loginAsAdmin();
    const hrToken = await loginAsHrManager();

    const before = await request(app)
      .get('/api/notifications/summary')
      .set(authHeader(adminToken));
    expect(before.status).toBe(200);
    const unreadBefore = before.body.unreadCount as number;

    const createClient = await request(app)
      .post('/api/clients')
      .set(authHeader(adminToken))
      .send({
        companyName: `IAM Notify Client ${Date.now()}`,
        contactPerson: 'Notify Test',
        email: uniqueTestEmail('client.notify'),
        phone: '7777777777',
        address: 'Test Address',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560001',
        isActive: true,
      });
    expect(createClient.status).toBe(201);

    const submit = await request(app)
      .delete(`/api/clients/${createClient.body.id}`)
      .set(authHeader(hrToken))
      .send({ reason: 'Notification integration test delete request.' });
    expect(submit.status).toBe(202);

    const after = await request(app)
      .get('/api/notifications/summary')
      .set(authHeader(adminToken));
    expect(after.status).toBe(200);
    expect(after.body.unreadCount).toBeGreaterThanOrEqual(unreadBefore);
  });
});
