import { Request, Response } from 'express';
import { attendanceService } from './attendance.service';
import { sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { parseCursorPaginationQuery } from '../../types';

function periodFromQuery(req: Request) {
  return {
    clientId: String(req.query.clientId),
    month: Number(req.query.month),
    year: Number(req.query.year),
  };
}

function actor(req: Request) {
  return req.user?.username ?? 'System';
}

function workbookFilename(month: number, year: number, suffix: string, ext = 'xlsx') {
  return `attendance-${suffix}-${year}-${String(month).padStart(2, '0')}.${ext}`;
}

export class AttendanceController {
  async employeeList(req: Request, res: Response) {
    const pagination = parseCursorPaginationQuery(req.query);
    const result = await attendanceService.getEmployeeList({
      ...periodFromQuery(req),
      ...pagination,
    });
    sendSuccess(res, result);
  }

  async grid(req: Request, res: Response) {
    const p = periodFromQuery(req);
    const result = await attendanceService.getGrid(p, actor(req));
    sendSuccess(res, result);
  }

  async updateCells(req: Request, res: Response) {
    const { clientId, month, year, updates } = req.body as {
      clientId: string;
      month: number;
      year: number;
      updates: Array<{ employeeId: string; date: string; status: number | null }>;
    };
    const result = await attendanceService.updateCells(clientId, month, year, updates, actor(req));
    sendSuccess(res, result);
  }

  async submitEmployeeRow(req: Request, res: Response) {
    const employeeId = paramId(req, 'employeeId');
    const {
      clientId,
      month,
      year,
      presentDays,
      overtimeHours,
      nightAllowance,
      punctualityAward,
      bonus,
    } = req.body as {
      clientId: string;
      month: number;
      year: number;
      presentDays: number;
      overtimeHours?: number;
      nightAllowance?: number;
      punctualityAward?: number;
      bonus?: number;
    };
    const result = await attendanceService.submitEmployeeRow(
      clientId,
      month,
      year,
      employeeId,
      actor(req),
      {
        presentDays: Number(presentDays),
        overtimeHours: overtimeHours ?? 0,
        nightAllowance: nightAllowance ?? 0,
        punctualityAward: punctualityAward ?? 0,
        bonus: bonus ?? 0,
      },
    );
    sendSuccess(res, result);
  }

  async bulkMark(req: Request, res: Response) {
    const result = await attendanceService.bulkMark(req.body, actor(req));
    sendSuccess(res, result);
  }

  async importTemplate(req: Request, res: Response) {
    const p = periodFromQuery(req);
    const buffer = await attendanceService.buildImportTemplate(
      p.clientId,
      p.month,
      p.year,
      actor(req),
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${workbookFilename(p.month, p.year, 'template')}"`,
    );
    res.send(buffer);
  }

  async exportRegister(req: Request, res: Response) {
    const p = periodFromQuery(req);
    const format = req.query.format === 'pdf' ? 'pdf' : 'excel';
    const buffer = await attendanceService.exportRegister(
      p.clientId,
      p.month,
      p.year,
      actor(req),
      format,
    );
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${workbookFilename(p.month, p.year, 'register', 'pdf')}"`,
      );
    } else {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${workbookFilename(p.month, p.year, 'register')}"`,
      );
    }
    res.send(buffer);
  }

  async previewImportFile(req: Request, res: Response) {
    const p = periodFromQuery(req);
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ message: 'Excel file is required.' });
      return;
    }
    const result = await attendanceService.previewImportBuffer(
      p.clientId,
      p.month,
      p.year,
      file.buffer,
      file.originalname,
    );
    sendSuccess(res, result);
  }

  async applyImportFile(req: Request, res: Response) {
    const p = periodFromQuery(req);
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ message: 'Excel file is required.' });
      return;
    }
    const result = await attendanceService.applyImportBuffer(
      p.clientId,
      p.month,
      p.year,
      file.buffer,
      file.originalname,
      actor(req),
    );
    sendSuccess(res, result);
  }

  async lock(req: Request, res: Response) {
    const result = await attendanceService.lockRegister(req.body, actor(req));
    sendSuccess(res, result);
  }

  async unlock(req: Request, res: Response) {
    const result = await attendanceService.unlockRegister(req.body, actor(req));
    sendSuccess(res, result);
  }

  async unlockHistory(req: Request, res: Response) {
    const p = periodFromQuery(req);
    const result = await attendanceService.getUnlockHistory(p.clientId, p.month, p.year);
    sendSuccess(res, result);
  }

  async employeeCalendar(req: Request, res: Response) {
    const result = await attendanceService.getEmployeeCalendar(
      paramId(req, 'employeeId'),
      Number(req.query.month),
      Number(req.query.year),
    );
    sendSuccess(res, result);
  }
}

export const attendanceController = new AttendanceController();
