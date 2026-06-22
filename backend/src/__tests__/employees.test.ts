import request from 'supertest';
import { app, authHeader, loginAsAdmin } from './helpers/test-app';
import { Gender, EmploymentType } from '../types/enums';
import { EmployeeLifecycleStatus } from '../modules/employee/employee.constants';

describe('Employees API', () => {
  let token: string;
  let createdEmployeeId: string;
  let draftEmployeeId: string;
  let demoClientId: string;

  beforeAll(async () => {
    token = await loginAsAdmin();
    const clientsRes = await request(app)
      .get('/api/clients?page=1&pageSize=1')
      .set(authHeader(token));
    demoClientId = clientsRes.body.items[0]?.id as string;
  });

  it('lists employees with pagination', async () => {
    const res = await request(app)
      .get('/api/employees?page=1&pageSize=10')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  it('generates employee code', async () => {
    const res = await request(app)
      .get('/api/employees/generate-code')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^SS-\d{5}$/);
  });

  it('saves an employee draft', async () => {
    const res = await request(app)
      .post('/api/employees/draft')
      .set(authHeader(token))
      .send({
        firstName: 'Draft',
        lastName: 'User',
        phone: '9123456789',
        draftStep: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.employeeCode).toMatch(/^SS-\d{5}$/);
    draftEmployeeId = res.body.id;
  });

  it('saves a draft with empty date of birth', async () => {
    const res = await request(app)
      .post('/api/employees/draft')
      .set(authHeader(token))
      .send({
        firstName: 'NoDob',
        lastName: 'Draft',
        email: `nodob.draft.${Date.now()}@signet-erp.com`,
        phone: '9123456790',
        dateOfBirth: '',
        joiningDate: '2024-01-01',
        employmentType: EmploymentType.FullTime,
        clientId: demoClientId,
        departmentId: 'dept-001',
        designationId: 'des-002',
        draftStep: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('submits a draft employee', async () => {
    await request(app)
      .put(`/api/employees/${draftEmployeeId}/draft`)
      .set(authHeader(token))
      .send({
        id: draftEmployeeId,
        firstName: 'Draft',
        lastName: 'User',
        email: `draft.user.${Date.now()}@signet-erp.com`,
        phone: '9123456789',
        dateOfBirth: '1995-06-15',
        gender: Gender.Male,
        joiningDate: '2024-01-01',
        employmentType: EmploymentType.FullTime,
        clientId: demoClientId,
        departmentId: 'dept-001',
        designationId: 'des-002',
        basicSalary: 15000,
        grossSalary: 25000,
        draftStep: 6,
      });

    const res = await request(app)
      .post(`/api/employees/${draftEmployeeId}/submit`)
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(EmployeeLifecycleStatus.Active);
    expect(res.body.fullName).toBe('Draft User');
  });

  it('creates an employee', async () => {
    const payload = {
      firstName: 'Test',
      lastName: 'Employee',
      email: `test.employee.${Date.now()}@signet-erp.com`,
      phone: '9876543210',
      dateOfBirth: '1995-06-15',
      gender: Gender.Male,
      joiningDate: '2024-01-01',
      employmentType: EmploymentType.FullTime,
      clientId: demoClientId,
      departmentId: 'dept-001',
      designationId: 'des-002',
      basicSalary: 15000,
      grossSalary: 25000,
    };

    const res = await request(app)
      .post('/api/employees')
      .set(authHeader(token))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.employeeCode).toMatch(/^SS-\d{5}$/);
    createdEmployeeId = res.body.id;
  });

  it('gets employee by id', async () => {
    const res = await request(app)
      .get(`/api/employees/${createdEmployeeId}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdEmployeeId);
    expect(res.body.firstName).toBe('Test');
    expect(res.body.departmentCode).toBe('dept-001');
    expect(res.body.departmentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.body.status).toBe(EmployeeLifecycleStatus.Active);
  });

  it('uploads employee profile photo', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const res = await request(app)
      .post(`/api/employees/${createdEmployeeId}/photo`)
      .set(authHeader(token))
      .attach('photo', pngBuffer, 'photo.png');

    expect(res.status).toBe(200);
    expect(res.body.url).toBeDefined();
    expect(res.body.profilePhotoUrl).toBeDefined();

    const detail = await request(app)
      .get(`/api/employees/${createdEmployeeId}`)
      .set(authHeader(token));

    expect(detail.body.profilePhotoUrl).toBe(res.body.profilePhotoUrl);
  });

  it('uploads via documents endpoint for employee', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const res = await request(app)
      .post('/api/documents/upload')
      .set(authHeader(token))
      .field('entityType', 'employee')
      .field('entityId', createdEmployeeId)
      .field('documentType', '1')
      .attach('photo', pngBuffer, 'avatar.png');

    expect(res.status).toBe(200);
    expect(res.body.profilePhotoUrl).toBeDefined();
  });

  it('updates an employee', async () => {
    const res = await request(app)
      .put(`/api/employees/${createdEmployeeId}`)
      .set(authHeader(token))
      .send({
        id: createdEmployeeId,
        firstName: 'Updated',
        lastName: 'Employee',
        phone: '9876543210',
        dateOfBirth: '1995-06-15',
        gender: Gender.Male,
        status: EmployeeLifecycleStatus.Active,
        employmentType: EmploymentType.FullTime,
        clientId: demoClientId,
        departmentId: 'dept-002',
        designationId: 'des-001',
        basicSalary: 16000,
        grossSalary: 26000,
      });

    expect(res.status).toBe(204);
  });

  it('marks an employee as left and rejoins', async () => {
    const markLeftRes = await request(app)
      .post(`/api/employees/${createdEmployeeId}/mark-left`)
      .set(authHeader(token))
      .send({
        lastWorkingDate: '2025-12-31T00:00:00.000Z',
        reason: 'Resignation',
        remarks: 'Voluntary exit',
      });

    expect(markLeftRes.status).toBe(204);

    const leftRes = await request(app)
      .get(`/api/employees/${createdEmployeeId}`)
      .set(authHeader(token));

    expect(leftRes.status).toBe(200);
    expect(leftRes.body.status).toBe(EmployeeLifecycleStatus.Left);

    const rejoinRes = await request(app)
      .post(`/api/employees/${createdEmployeeId}/rejoin`)
      .set(authHeader(token))
      .send({
        joiningDate: '2026-01-15T00:00:00.000Z',
        clientId: demoClientId,
        departmentId: 'dept-001',
        designationId: 'des-002',
        reuseEmployeeCode: true,
      });

    expect(rejoinRes.status).toBe(204);

    const rejoinedRes = await request(app)
      .get(`/api/employees/${createdEmployeeId}`)
      .set(authHeader(token));

    expect(rejoinedRes.status).toBe(200);
    expect(rejoinedRes.body.status).toBe(EmployeeLifecycleStatus.Rejoined);
  });

  it('rejects employee delete endpoint', async () => {
    const res = await request(app)
      .delete(`/api/employees/${createdEmployeeId}`)
      .set(authHeader(token));

    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });
});
