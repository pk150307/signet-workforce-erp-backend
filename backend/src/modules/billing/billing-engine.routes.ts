import { Router } from 'express';
import { body, query } from 'express-validator';
import { billingEngineService } from './billing-engine.service';
import { validate } from '../../common/response';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

const calculateValidation = [
  body('month').isInt({ min: 1, max: 12 }),
  body('year').isInt({ min: 2000, max: 2100 }),
  body('clientId').isUUID(),
  body('siteId').isUUID(),
  body('skipValidation').optional().isBoolean(),
  body('requirePayroll').optional().isBoolean(),
  body('requireAttendance').optional().isBoolean(),
];

router.post('/validate', validate(calculateValidation), (req, res, next) => {
  billingEngineService
    .validate({
      month: Number(req.body.month),
      year: Number(req.body.year),
      clientId: String(req.body.clientId),
      siteId: String(req.body.siteId),
      requirePayroll: req.body.requirePayroll,
      requireAttendance: req.body.requireAttendance,
    })
    .then((result) => res.json(result))
    .catch(next);
});

router.post('/calculate', validate(calculateValidation), (req, res, next) => {
  billingEngineService
    .calculate({
      month: Number(req.body.month),
      year: Number(req.body.year),
      clientId: String(req.body.clientId),
      siteId: String(req.body.siteId),
      skipValidation: req.body.skipValidation,
      requirePayroll: req.body.requirePayroll,
      requireAttendance: req.body.requireAttendance,
    })
    .then((result) => res.json(result))
    .catch(next);
});

router.get(
  '/validate',
  validate([
    query('month').isInt({ min: 1, max: 12 }).toInt(),
    query('year').isInt({ min: 2000, max: 2100 }).toInt(),
    query('clientId').isUUID(),
    query('siteId').isUUID(),
  ]),
  (req, res, next) => {
    billingEngineService
      .validate({
        month: Number(req.query.month),
        year: Number(req.query.year),
        clientId: String(req.query.clientId),
        siteId: String(req.query.siteId),
      })
      .then((result) => res.json(result))
      .catch(next);
  },
);

export default router;
