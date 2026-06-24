import { Router } from 'express';
import { employeeController } from './employee.controller';
import {
  bulkImportValidation,
  createEmployeeValidation,
  documentIdValidation,
  employeeIdValidation,
  getEmployeesValidation,
  limitValidation,
  markLeftValidation,
  rejoinValidation,
  saveDraftValidation,
  updateDraftValidation,
  updateEmployeeValidation,
  uploadDocumentValidation,
} from './employee.validation';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';
import { documentUpload, photoUpload } from '../documents/upload.config';

const router = Router();

router.use(authenticate);

router.get('/dashboard', (req, res, next) => {
  employeeController.getDashboard(req, res).catch(next);
});

router.get('/recent', validate(limitValidation), (req, res, next) => {
  employeeController.getRecent(req, res).catch(next);
});

router.get('/activities', validate(limitValidation), (req, res, next) => {
  employeeController.getActivities(req, res).catch(next);
});

router.get('/generate-code', (req, res, next) => {
  employeeController.generateCode(req, res).catch(next);
});

router.get('/export', (req, res, next) => {
  employeeController.exportEmployees(req, res).catch(next);
});

router.post('/bulk/import', validate(bulkImportValidation), (req, res, next) => {
  employeeController.bulkImport(req, res).catch(next);
});

router.post('/draft', validate(saveDraftValidation), (req, res, next) => {
  employeeController.saveDraft(req, res).catch(next);
});

router.get('/', validate(getEmployeesValidation), (req, res, next) => {
  employeeController.getAll(req, res).catch(next);
});

router.post('/', validate(createEmployeeValidation), (req, res, next) => {
  employeeController.create(req, res).catch(next);
});

router.put('/:id/draft', validate(updateDraftValidation), (req, res, next) => {
  employeeController.updateDraft(req, res).catch(next);
});

router.post('/:id/submit', validate(employeeIdValidation), (req, res, next) => {
  employeeController.submit(req, res).catch(next);
});

router.post('/:id/photo', validate(employeeIdValidation), photoUpload.single('photo'), (req, res, next) => {
  employeeController.uploadPhoto(req, res).catch(next);
});

router.get('/:id/photo/download', validate(employeeIdValidation), (req, res, next) => {
  employeeController.downloadPhoto(req, res).catch(next);
});

router.post(
  '/:id/documents',
  documentUpload.single('file'),
  validate(uploadDocumentValidation),
  (req, res, next) => {
    employeeController.uploadDocument(req, res).catch(next);
  },
);

router.delete('/:id/documents/:documentId', validate(documentIdValidation), (req, res, next) => {
  employeeController.deleteDocument(req, res).catch(next);
});

router.get('/:id/documents/:documentId/download', validate(documentIdValidation), (req, res, next) => {
  employeeController.downloadDocument(req, res).catch(next);
});

router.get('/:id/documents', validate(employeeIdValidation), (req, res, next) => {
  employeeController.getDocuments(req, res).catch(next);
});

router.get('/:id/profile', validate(employeeIdValidation), (req, res, next) => {
  employeeController.getProfile(req, res).catch(next);
});

router.get('/:id/timeline', validate(employeeIdValidation), (req, res, next) => {
  employeeController.getTimeline(req, res).catch(next);
});

router.get('/:id/history', validate(employeeIdValidation), (req, res, next) => {
  employeeController.getHistory(req, res).catch(next);
});

router.post('/:id/mark-left', validate(markLeftValidation), (req, res, next) => {
  employeeController.markLeft(req, res).catch(next);
});

router.post('/:id/rejoin', validate(rejoinValidation), (req, res, next) => {
  employeeController.rejoin(req, res).catch(next);
});

router.get('/:id', validate(employeeIdValidation), (req, res, next) => {
  employeeController.getById(req, res).catch(next);
});

router.put('/:id', validate(updateEmployeeValidation), (req, res, next) => {
  employeeController.update(req, res).catch(next);
});

export default router;
