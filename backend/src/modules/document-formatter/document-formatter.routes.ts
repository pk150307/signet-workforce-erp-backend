import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { documentFormatterController } from './document-formatter.controller';
import { formatAttendanceValidation } from './document-formatter.validation';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
      cb(null, true);
      return;
    }
    cb(new AppError(400, 'Only .xlsx register files are allowed.'));
  },
});

router.use(authenticate);

/**
 * @openapi
 * /api/document-formatter/attendance/preview:
 *   post:
 *     tags: [Document Formatter]
 *     summary: Match a raw attendance register to employees and preview the attendance template
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Matched and unmatched attendance rows
 */
router.post('/attendance/preview', upload.single('file'), validate(formatAttendanceValidation), (req, res, next) => {
  documentFormatterController.preview(req, res).catch(next);
});

/**
 * @openapi
 * /api/document-formatter/attendance/export:
 *   post:
 *     tags: [Document Formatter]
 *     summary: Download the raw register converted to the attendance import template
 *     parameters:
 *       - in: query
 *         name: clientId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Attendance workbook
 */
router.post('/attendance/export', upload.single('file'), validate(formatAttendanceValidation), (req, res, next) => {
  documentFormatterController.exportWorkbook(req, res).catch(next);
});

export default router;
