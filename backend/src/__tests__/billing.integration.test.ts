import request from 'supertest';
import { app, authHeader, loginAsAdmin } from './helpers/test-app';
import { InvoiceStatus } from '../types/enums';

describe('Billing API', () => {
  let token: string;
  let clientId: string;
  let siteId: string;
  let invoiceId: string;

  beforeAll(async () => {
    token = await loginAsAdmin();

    const clientsRes = await request(app)
      .get('/api/clients?page=1&pageSize=1')
      .set(authHeader(token));
    clientId = clientsRes.body.items[0]?.id;

    if (clientId) {
      const sitesRes = await request(app)
        .get(`/api/clients/${clientId}/sites?page=1&pageSize=1`)
        .set(authHeader(token));
      siteId = sitesRes.body.items[0]?.id;
    }
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/billing/invoices');
    expect(res.status).toBe(401);
  });

  it('lists billing component catalog', async () => {
    const res = await request(app)
      .get('/api/billing/configurations/components')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('lists invoices with pagination', async () => {
    const res = await request(app)
      .get('/api/billing/invoices?page=1&pageSize=10')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.page).toBe(1);
  });

  it('returns billing period summary report', async () => {
    const res = await request(app)
      .get('/api/billing/reports/summary?month=6&year=2026')
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.invoiceCount).toBeDefined();
    expect(res.body.totalBilled).toBeDefined();
    expect(res.body.totalGst).toBeDefined();
  });

  it('returns outstanding and GST reports', async () => {
    const outstanding = await request(app)
      .get('/api/billing/reports/outstanding')
      .set(authHeader(token));
    expect(outstanding.status).toBe(200);
    expect(outstanding.body.summary).toBeDefined();
    expect(outstanding.body.items).toBeInstanceOf(Array);

    const gst = await request(app)
      .get('/api/billing/reports/gst?month=6&year=2026')
      .set(authHeader(token));
    expect(gst.status).toBe(200);
    expect(gst.body.summary).toBeDefined();
    expect(gst.body.byClient).toBeInstanceOf(Array);
  });

  it('lists invoice audit logs and actions', async () => {
    const actions = await request(app)
      .get('/api/billing/audit-logs/actions')
      .set(authHeader(token));
    expect(actions.status).toBe(200);
    expect(Array.isArray(actions.body)).toBe(true);

    const logs = await request(app)
      .get('/api/billing/audit-logs?page=1&pageSize=10')
      .set(authHeader(token));
    expect(logs.status).toBe(200);
    expect(logs.body.items).toBeInstanceOf(Array);
  });

  it('creates a draft invoice, records payments, and exposes audit activity', async () => {
    if (!clientId || !siteId) {
      pending('No demo client/site available for billing integration test');
      return;
    }

    const createRes = await request(app)
      .post('/api/billing/invoices')
      .set(authHeader(token))
      .send({
        clientId,
        siteId,
        invoiceDate: '2026-06-01',
        dueDate: '2026-06-30',
        month: 6,
        year: 2026,
        gstRate: 18,
        lineItems: [
          { description: 'Test manpower services', quantity: 10, unitRate: 1000, hsnSacCode: '998519' },
        ],
      });

    expect(createRes.status).toBe(200);
    invoiceId = createRes.body.id;
    expect(invoiceId).toBeDefined();

    const detailRes = await request(app)
      .get(`/api/billing/invoices/${invoiceId}`)
      .set(authHeader(token));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.totalAmount).toBe(11800);

    const statusRes = await request(app)
      .patch(`/api/billing/invoices/${invoiceId}/status`)
      .set(authHeader(token))
      .send({ status: InvoiceStatus.Sent, note: 'Ready for payment test' });
    expect(statusRes.status).toBe(200);

    const paymentRes = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set(authHeader(token))
      .send({
        paymentDate: '2026-06-15',
        amount: 5000,
        paymentMode: 'neft',
        utrNumber: 'TEST-UTR-001',
      });
    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.payment.amount).toBe(5000);
    expect(paymentRes.body.summary.paidAmount).toBe(5000);
    expect(paymentRes.body.summary.status).toBe(InvoiceStatus.PartiallyPaid);

    const summaryRes = await request(app)
      .get(`/api/billing/invoices/${invoiceId}/payments/summary`)
      .set(authHeader(token));
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.balanceAmount).toBe(6800);

    const collectionsRes = await request(app)
      .get('/api/billing/reports/collections?month=6&year=2026')
      .set(authHeader(token));
    expect(collectionsRes.status).toBe(200);
    expect(collectionsRes.body.summary.totalCollected).toBeGreaterThanOrEqual(5000);

    const activityRes = await request(app)
      .get(`/api/billing/invoices/${invoiceId}/activity`)
      .set(authHeader(token));
    expect(activityRes.status).toBe(200);
    expect(Array.isArray(activityRes.body)).toBe(true);
    expect(activityRes.body.some((e: { type: string }) => e.type === 'audit')).toBe(true);

    const auditRes = await request(app)
      .get(`/api/billing/invoices/${invoiceId}/audit-logs`)
      .set(authHeader(token));
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.items.length).toBeGreaterThan(0);

    const previewRes = await request(app)
      .get(`/api/billing/invoices/${invoiceId}/preview`)
      .set(authHeader(token));
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.invoiceNumber).toBeDefined();
    expect(previewRes.body.amountInWords).toContain('Rupees');

    const htmlRes = await request(app)
      .get(`/api/billing/invoices/${invoiceId}/preview?format=html`)
      .set(authHeader(token));
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.text).toContain('Tax Invoice');
  });

  it('rejects payment exceeding balance', async () => {
    if (!invoiceId) {
      pending('Invoice not created in prior test');
      return;
    }

    const res = await request(app)
      .post(`/api/billing/invoices/${invoiceId}/payments`)
      .set(authHeader(token))
      .send({
        paymentDate: '2026-06-16',
        amount: 999999,
        paymentMode: 'neft',
      });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown invoice audit log', async () => {
    const res = await request(app)
      .get('/api/billing/audit-logs/00000000-0000-4000-8000-000000000099')
      .set(authHeader(token));
    expect(res.status).toBe(404);
  });
});
