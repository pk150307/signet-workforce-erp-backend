import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendId, sendNoContent, sendSuccess, validate } from '../../common/response';
import {
  defaultSortFields,
  parseCursorPaginationQuery,
  pageSizeQueryValidator,
  parsePageSize,
  runCursorList,
} from '../../types';
import { LeaveStatus, LeaveType } from '../../types/enums';
import { formatDate } from '../../utils/formatters';
import { NotFoundError, AppError } from '../../common/errors';
import { paramId } from '../../utils/request';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    pageSizeQueryValidator,
    query('cursor').optional().isString().trim(),
    query('direction').optional().isIn(['next', 'prev']),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = parseCursorPaginationQuery({
        pageSize: parsePageSize(req.query.pageSize),
        cursor: req.query.cursor as string | undefined,
        direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
      });

      const result = await runCursorList({
        queryFn: dbQuery,
        pagination,
        conditions: ['NOT lr.is_deleted'],
        selectSql: `SELECT lr.id, e.first_name, e.last_name, lr.leave_type, lr.status,
                lr.from_date, lr.to_date, lr.number_of_days, lr.reason, lr.created_at
         FROM leave_requests lr
         INNER JOIN employees e ON e.id = lr.employee_id`,
        sortFields: defaultSortFields('lr'),
        mapRow: (r) => ({
          id: String(r.id),
          employeeName: `${r.first_name} ${r.last_name}`,
          leaveType: Number(r.leave_type) as LeaveType,
          status: Number(r.status) as LeaveStatus,
          fromDate: formatDate(String(r.from_date)),
          toDate: formatDate(String(r.to_date)),
          numberOfDays: parseFloat(String(r.number_of_days)),
          reason: String(r.reason),
        }),
      });

      sendSuccess(res, result);
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/request',
  validate([
    body('employeeId').isUUID(),
    body('leaveType').isInt({ min: 1, max: 7 }),
    body('fromDate').isISO8601(),
    body('toDate').isISO8601(),
    body('isHalfDay').optional().isBoolean(),
    body('halfDaySession').optional().isString(),
    body('reason').notEmpty().isLength({ max: 500 }),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fromDate = new Date(req.body.fromDate);
      const toDate = new Date(req.body.toDate);
      const numberOfDays = req.body.isHalfDay
        ? 0.5
        : Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const { rows: balanceRows } = await dbQuery<{ remaining: string }>(
        `SELECT remaining FROM leave_balances
         WHERE employee_id = $1 AND leave_type = $2 AND year = $3 AND NOT is_deleted`,
        [req.body.employeeId, req.body.leaveType, fromDate.getFullYear()],
      );

      if (balanceRows[0] && parseFloat(balanceRows[0].remaining) < numberOfDays) {
        throw new AppError(
          400,
          `Insufficient leave balance. Available: ${balanceRows[0].remaining} days, Requested: ${numberOfDays} days.`,
        );
      }

      const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO leave_requests (
          employee_id, leave_type, from_date, to_date, number_of_days,
          is_half_day, half_day_session, reason, status, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          req.body.employeeId,
          req.body.leaveType,
          req.body.fromDate,
          req.body.toDate,
          numberOfDays,
          req.body.isHalfDay ?? false,
          req.body.halfDaySession ?? '',
          req.body.reason,
          LeaveStatus.Pending,
          req.user?.username ?? 'System',
        ],
      );

      if (balanceRows[0]) {
        await dbQuery(
          `UPDATE leave_balances SET pending = pending + $2, updated_at = NOW()
           WHERE employee_id = $1 AND leave_type = $3 AND year = $4`,
          [req.body.employeeId, numberOfDays, req.body.leaveType, fromDate.getFullYear()],
        );
      }

      sendId(res, rows[0].id);
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  '/:id/approve',
  validate([
    param('id').isUUID(),
    body('approve').isBoolean(),
    body('comments').optional({ nullable: true }).isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await dbQuery<Record<string, unknown>>(
        `SELECT * FROM leave_requests WHERE id = $1 AND NOT is_deleted`,
        [paramId(req)],
      );
      const leave = rows[0];
      if (!leave) throw new NotFoundError('LeaveRequest', paramId(req));
      if (Number(leave.status) !== LeaveStatus.Pending) {
        throw new AppError(400, 'Only pending leave requests can be approved or rejected.');
      }

      const approve = req.body.approve as boolean;
      const newStatus = approve ? LeaveStatus.Approved : LeaveStatus.Rejected;

      await dbQuery(
        `UPDATE leave_requests SET status = $2, action_date = NOW(), approver_comments = $3,
         rejection_reason = $4, updated_at = NOW(), updated_by = $5
         WHERE id = $1`,
        [
          paramId(req),
          newStatus,
          req.body.comments ?? null,
          approve ? null : req.body.comments ?? null,
          req.user?.username ?? 'System',
        ],
      );

      const { rows: balanceRows } = await dbQuery<{ id: string }>(
        `SELECT id FROM leave_balances
         WHERE employee_id = $1 AND leave_type = $2 AND year = $3 AND NOT is_deleted`,
        [leave.employee_id, leave.leave_type, new Date(String(leave.from_date)).getFullYear()],
      );

      if (balanceRows[0]) {
        if (approve) {
          await dbQuery(
            `UPDATE leave_balances SET pending = pending - $2, used = used + $2, updated_at = NOW()
             WHERE id = $1`,
            [balanceRows[0].id, leave.number_of_days],
          );
        } else {
          await dbQuery(
            `UPDATE leave_balances SET pending = pending - $2, updated_at = NOW() WHERE id = $1`,
            [balanceRows[0].id, leave.number_of_days],
          );
        }
      }

      sendNoContent(res);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
