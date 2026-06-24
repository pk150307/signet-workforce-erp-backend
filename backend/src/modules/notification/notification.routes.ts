import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { notificationController } from './notification.controller';
import {
  listNotificationsValidation,
  notificationIdValidation,
} from './notification.validation';

const router = Router();

router.use(authenticate);

router.get(
  '/summary',
  (req, res, next) => {
    notificationController.summary(req, res).catch(next);
  },
);

router.get(
  '/',
  validate(listNotificationsValidation),
  (req, res, next) => {
    notificationController.list(req, res).catch(next);
  },
);

router.put('/read-all', (req, res, next) => {
  notificationController.markAllRead(req, res).catch(next);
});

router.put(
  '/:id/read',
  validate(notificationIdValidation),
  (req, res, next) => {
    notificationController.markRead(req, res).catch(next);
  },
);

router.put(
  '/:id/unread',
  validate(notificationIdValidation),
  (req, res, next) => {
    notificationController.markUnread(req, res).catch(next);
  },
);

router.get(
  '/:id',
  validate(notificationIdValidation),
  (req, res, next) => {
    notificationController.getById(req, res).catch(next);
  },
);

router.delete(
  '/:id',
  validate(notificationIdValidation),
  (req, res, next) => {
    notificationController.dismiss(req, res).catch(next);
  },
);

export default router;
