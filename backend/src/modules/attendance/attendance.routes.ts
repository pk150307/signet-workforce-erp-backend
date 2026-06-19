import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { query as dbQuery } from '../../database/pool';
import { authenticate } from '../../middleware/auth.middleware';
import { sendId, sendSuccess, validate } from '../../common/response';
import { formatDate, formatInterval, formatTime } from '../../utils/formatters';
import { createPaginatedResult } from '../../types';
import { AttendanceStatus } from '../../types/enums';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  validate([
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('employeeId').optional().isUUID(),
    query('siteId').optional().isUUID(),
    query('fromDate').optional().isISO8601(),
    query('toDate').optional().isISO8601(),
    query('status').optional().isInt({ min: 1, max: 8 }).toInt(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 50;
      const conditions = ['NOT a.is_deleted'];
      const params: unknown[] = [];
      let i = 1;

      if (req.query.employeeId) {
        conditions.push(`a.employee_id = $${i++}::uuid`);
        params.push(req.query.employeeId);
      }
      if (req.query.siteId) {
        conditions.push(`a.site_id = $${i++}::uuid`);
        params.push(req.query.siteId);
      }
      if (req.query.fromDate) {
        conditions.push(`a.attendance_date >= $${i++}`);
        params.push(req.query.fromDate);
      }
      if (req.query.toDate) {
        conditions.push(`a.attendance_date <= $${i++}`);
        params.push(req.query.toDate);
      }
      if (req.query.status) {
        conditions.push(`a.status = $${i++}`);
        params.push(Number(req.query.status));
      }

      const where = conditions.join(' AND ');
      const count = await dbQuery<{ count: string }>(
        `SELECT COUNT(*) AS count FROM attendances a WHERE ${where}`,
        params,
      );

      const { rows } = await dbQuery<Record<string, unknown>>(
        `SELECT a.id, a.employee_id, e.first_name, e.last_name, e.employee_code,
                a.attendance_date, a.status, a.check_in_time, a.check_out_time,
                a.working_hours, s.site_name, a.is_manual_entry
         FROM attendances a
         INNER JOIN employees e ON e.id = a.employee_id
         LEFT JOIN sites s ON s.id = a.site_id
         WHERE ${where}
         ORDER BY a.attendance_date DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, pageSize, (page - 1) * pageSize],
      );

      const items = rows.map((r) => ({
        id: String(r.id),
        employeeName: `${r.first_name} ${r.last_name}`,
        employeeCode: String(r.employee_code),
        attendanceDate: formatDate(String(r.attendance_date)),
        status: Number(r.status) as AttendanceStatus,
        checkInTime: formatTime(r.check_in_time as string | null),
        checkOutTime: formatTime(r.check_out_time as string | null),
        workingHours: formatInterval(r.working_hours as string | null),
        siteName: r.site_name ? String(r.site_name) : null,
        isManualEntry: Boolean(r.is_manual_entry),
      }));

      sendSuccess(
        res,
        createPaginatedResult(items, parseInt(count.rows[0].count, 10), page, pageSize),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  '/mark',
  validate([
    body('employeeId').isUUID(),
    body('attendanceDate').isISO8601(),
    body('status').isInt({ min: 1, max: 8 }),
    body('siteId').optional().isUUID(),
    body('checkInTime').optional().isString(),
    body('checkOutTime').optional().isString(),
    body('remarks').optional().isString(),
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await dbQuery<{ id: string }>(
        `INSERT INTO attendances (
          employee_id, site_id, attendance_date, status, check_in_time, check_out_time,
          is_manual_entry, remarks, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
        ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
          status = EXCLUDED.status, site_id = EXCLUDED.site_id,
          check_in_time = EXCLUDED.check_in_time, check_out_time = EXCLUDED.check_out_time,
          remarks = EXCLUDED.remarks, updated_at = NOW(), updated_by = EXCLUDED.created_by
        RETURNING id`,
        [
          req.body.employeeId,
          req.body.siteId ?? null,
          req.body.attendanceDate,
          req.body.status,
          req.body.checkInTime ?? null,
          req.body.checkOutTime ?? null,
          req.body.remarks ?? null,
          req.user?.username ?? 'System',
        ],
      );
      sendId(res, rows[0].id);
    } catch (e) {
      next(e);
    }
  },
);

export default router;
