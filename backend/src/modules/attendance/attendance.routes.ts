import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../common/response';
import { attendanceController } from './attendance.controller';
import {
  bulkMarkValidation,
  employeeCalendarValidation,
  lockValidation,
  registerPeriodQuery,
  submitEmployeeRowValidation,
  unlockValidation,
  updateCellsValidation,
} from './attendance.validation';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.csv')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only .xlsx or .csv register files are allowed.'));
  },
});

router.use(authenticate);

router.get('/registers/employees', validate(registerPeriodQuery), (req, res, next) => {
  attendanceController.employeeList(req, res).catch(next);
});

router.get('/registers/grid', validate(registerPeriodQuery), (req, res, next) => {
  attendanceController.grid(req, res).catch(next);
});

router.put('/registers/cells', validate(updateCellsValidation), (req, res, next) => {
  attendanceController.updateCells(req, res).catch(next);
});

router.put(
  '/registers/employees/:employeeId/cells',
  validate(submitEmployeeRowValidation),
  (req, res, next) => {
    attendanceController.submitEmployeeRow(req, res).catch(next);
  },
);

router.post('/registers/bulk', validate(bulkMarkValidation), (req, res, next) => {
  attendanceController.bulkMark(req, res).catch(next);
});

router.get('/registers/import/template', validate(registerPeriodQuery), (req, res, next) => {
  attendanceController.importTemplate(req, res).catch(next);
});

router.get('/registers/import/export', validate(registerPeriodQuery), (req, res, next) => {
  attendanceController.exportRegister(req, res).catch(next);
});

router.post(
  '/registers/import/file-preview',
  upload.single('file'),
  validate(registerPeriodQuery),
  (req, res, next) => {
    attendanceController.previewImportFile(req, res).catch(next);
  },
);

router.post(
  '/registers/import/file-apply',
  upload.single('file'),
  validate(registerPeriodQuery),
  (req, res, next) => {
    attendanceController.applyImportFile(req, res).catch(next);
  },
);

router.post('/registers/lock', validate(lockValidation), (req, res, next) => {
  attendanceController.lock(req, res).catch(next);
});

router.post('/registers/unlock', validate(unlockValidation), (req, res, next) => {
  attendanceController.unlock(req, res).catch(next);
});

router.get('/registers/unlock-history', validate(registerPeriodQuery), (req, res, next) => {
  attendanceController.unlockHistory(req, res).catch(next);
});

router.get(
  '/employees/:employeeId/calendar',
  validate(employeeCalendarValidation),
  (req, res, next) => {
    attendanceController.employeeCalendar(req, res).catch(next);
  },
);

export default router;
