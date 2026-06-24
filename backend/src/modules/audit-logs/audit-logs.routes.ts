import { Router } from 'express';
import { validate } from '../../common/response';
import { authenticate, authorizePermission } from '../../middleware/auth.middleware';
import { auditLogsController } from './audit-logs.controller';
import { AUDIT_LOG_PERMISSIONS } from './audit-logs.permissions';
import {
  auditLogIdValidation,
  auditLogSummaryValidation,
  listAuditLogsValidation,
} from './audit-logs.validation';

const router = Router();

router.use(authenticate);

router.get(
  '/export',
  authorizePermission(AUDIT_LOG_PERMISSIONS.EXPORT),
  validate(listAuditLogsValidation),
  (req, res, next) => {
    auditLogsController.export(req, res).catch(next);
  },
);

router.get(
  '/summary',
  authorizePermission(AUDIT_LOG_PERMISSIONS.READ),
  validate(auditLogSummaryValidation),
  (req, res, next) => {
    auditLogsController.summary(req, res).catch(next);
  },
);

router.get(
  '/',
  authorizePermission(AUDIT_LOG_PERMISSIONS.READ),
  validate(listAuditLogsValidation),
  (req, res, next) => {
    auditLogsController.list(req, res).catch(next);
  },
);

router.get(
  '/:id',
  authorizePermission(AUDIT_LOG_PERMISSIONS.READ),
  validate(auditLogIdValidation),
  (req, res, next) => {
    auditLogsController.getById(req, res).catch(next);
  },
);

export default router;
