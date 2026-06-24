import { Router } from 'express';
import { body, param } from 'express-validator';
import { documentsController } from './documents.controller';
import { upload } from './upload.config';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';

const router = Router();
router.use(authenticate);

router.post(
  '/upload',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
  ]),
  validate([
    body('entityType').optional().isString(),
    body('entityId').optional().isUUID(),
    body('documentType').optional().isInt({ min: 1, max: 99 }),
  ]),
  (req, res, next) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    req.file = files?.photo?.[0] ?? files?.file?.[0] ?? req.file;
    documentsController.upload(req, res).catch(next);
  },
);

router.get(
  '/:id/download',
  validate([param('id').isUUID().withMessage('Valid document ID is required')]),
  (req, res, next) => {
    documentsController.download(req, res).catch(next);
  },
);

export default router;
