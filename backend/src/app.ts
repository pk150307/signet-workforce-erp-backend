import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { swaggerSpec } from './config/swagger';
import { traceIdMiddleware } from './middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { uploadRoot } from './modules/documents/upload.config';

import authRoutes from './modules/auth/auth.routes';
import employeeRoutes from './modules/employee/employee.routes';
import departmentRoutes from './modules/department/department.routes';
import designationGradeRoutes from './modules/designation-grade/designation-grade.routes';
import designationRoutes from './modules/designation/designation.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import leaveRoutes from './modules/leave/leave.routes';
import payrollRoutes from './modules/payroll/payroll.routes';
import billingRoutes from './modules/billing/billing.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import clientRoutes from './modules/client/client.routes';
import siteRoutes from './modules/site/site.routes';
import documentsRoutes from './modules/documents/documents.routes';
import shiftRoutes from './modules/shift/shift.routes';
import holidayRoutes from './modules/holiday/holiday.routes';
import notificationRoutes from './modules/notification/notification.routes';
import reportsRoutes from './modules/reports/reports.routes';
import statutoryRoutes from './modules/statutory/statutory.routes';
import companyRoutes from './modules/company/company.routes';
import usersRoutes from './modules/users/users.routes';
import rolesRoutes from './modules/roles/roles.routes';
import permissionsRoutes from './modules/roles/permissions.routes';
import loginHistoryRoutes from './modules/login-history/login-history.routes';
import deleteRequestsRoutes from './modules/delete-requests/delete-requests.routes';
import auditLogsRoutes from './modules/audit-logs/audit-logs.routes';

export function createApp(): express.Application {
  const app = express();

  app.set('trust proxy', 1);
  app.use(traceIdMiddleware);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) },
    }),
  );

  app.use('/uploads', express.static(uploadRoot));

  if (!config.isProduction) {
    app.get('/openapi.json', (_req, res) => {
      res.json(swaggerSpec);
    });
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }

  app.get('/health', async (_req, res) => {
    const { checkDatabaseConnection } = await import('./database/pool');
    const { getStorageStatus } = await import('./modules/documents/storage.service');
    const dbOk = await checkDatabaseConnection();
    const storage = getStorageStatus();
    const storageUnhealthy = config.isProduction && Boolean(storage.error);
    res.status(dbOk && !storageUnhealthy ? 200 : 503).json({
      status: dbOk && !storageUnhealthy ? 'healthy' : 'unhealthy',
      database: dbOk,
      storage: {
        backend: storage.backend,
        bucket: storage.bucket,
        region: storage.region,
        uploadRoot: storage.uploadRoot,
        ...(storage.error ? { error: storage.error } : {}),
      },
    });
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'Signet Workforce ERP API',
      version: 'v1',
      status: 'running',
      health: '/health',
      docs: config.isProduction ? null : '/swagger',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/designations', designationRoutes);
  app.use('/api/designation-grades', designationGradeRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/leave', leaveRoutes);
  app.use('/api/payroll', payrollRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/sites', siteRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/holidays', holidayRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/statutory', statutoryRoutes);
  app.use('/api/company', companyRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/roles', rolesRoutes);
  app.use('/api/permissions', permissionsRoutes);
  app.use('/api/login-history', loginHistoryRoutes);
  app.use('/api/delete-requests', deleteRequestsRoutes);
  app.use('/api/audit-logs', auditLogsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
