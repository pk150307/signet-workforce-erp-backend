import { Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { sendSuccess } from '../../common/response';
import { documentFormatterService } from './document-formatter.service';

function uploadBuffer(req: Request): { buffer: Buffer; filename: string } {
  const file = req.file;
  if (!file?.buffer?.length) {
    throw new AppError(400, 'Upload a raw attendance Excel file.');
  }
  return { buffer: file.buffer, filename: file.originalname || 'attendance.xlsx' };
}

function requestedPeriod(req: Request): { month?: number; year?: number } {
  const month = req.query.month == null || req.query.month === '' ? undefined : Number(req.query.month);
  const year = req.query.year == null || req.query.year === '' ? undefined : Number(req.query.year);
  return {
    month: Number.isInteger(month) ? month : undefined,
    year: Number.isInteger(year) ? year : undefined,
  };
}

export class DocumentFormatterController {
  async preview(req: Request, res: Response) {
    const file = uploadBuffer(req);
    const result = await documentFormatterService.preview(
      String(req.query.clientId),
      file.buffer,
      file.filename,
    );
    sendSuccess(res, result);
  }

  async exportWorkbook(req: Request, res: Response) {
    const file = uploadBuffer(req);
    const result = await documentFormatterService.exportWorkbook(
      String(req.query.clientId),
      file.buffer,
      file.filename,
      requestedPeriod(req),
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }
}

export const documentFormatterController = new DocumentFormatterController();
