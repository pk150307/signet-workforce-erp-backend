import { AppError } from '../../common/errors';
import { logger } from '../../utils/logger';
import { buildMonthlyWorkbook, MonthlyExportEmployee } from '../attendance/attendance.excel';
import { matchAttendanceRows } from './document-formatter.match';
import { parseRawAttendanceBuffer } from './document-formatter.parser';
import { documentFormatterRepository } from './document-formatter.repository';
import { DocumentFormatterPreview, ParsedRawAttendance } from './document-formatter.types';

function assertWorkbookName(filename: string): void {
  const lower = filename.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xlsm')) {
    throw new AppError(400, 'Only .xlsx register files are allowed.');
  }
}

function assertZipWorkbook(buffer: Buffer): void {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new AppError(400, 'Upload a valid .xlsx attendance register.');
  }
}

async function readSheet(buffer: Buffer, filename: string): Promise<ParsedRawAttendance> {
  assertWorkbookName(filename);
  assertZipWorkbook(buffer);
  try {
    return await parseRawAttendanceBuffer(buffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Document formatter could not read workbook', {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(400, 'Could not read this Excel file. Upload the raw attendance register.');
  }
}

function exportRows(preview: DocumentFormatterPreview): MonthlyExportEmployee[] {
  return preview.rows
    .filter((row) => row.status === 'matched' && row.employeeCode && row.presentDays != null)
    .map((row) => ({
      employeeCode: row.employeeCode as string,
      employeeName: row.employeeName ?? '',
      softCode: row.softCode,
      fatherName: row.fatherName,
      presentDays: row.presentDays,
      overtimeHours: row.overtimeHours,
      nightAllowance: row.nightAllowance,
      punctualityAward: row.punctualityAward,
      bonus: row.bonus,
    }))
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
}

export class DocumentFormatterService {
  async preview(clientId: string, buffer: Buffer, filename: string): Promise<DocumentFormatterPreview> {
    const parsed = await readSheet(buffer, filename);
    const [clientName, employees] = await Promise.all([
      documentFormatterRepository.getClientName(clientId),
      documentFormatterRepository.listClientEmployees(clientId),
    ]);
    return matchAttendanceRows(parsed, employees, { clientId, clientName });
  }

  async exportWorkbook(
    clientId: string,
    buffer: Buffer,
    filename: string,
    period?: { month?: number; year?: number },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const parsed = await readSheet(buffer, filename);
    const [clientName, employees] = await Promise.all([
      documentFormatterRepository.getClientName(clientId),
      documentFormatterRepository.listClientEmployees(clientId),
    ]);
    const preview = matchAttendanceRows(parsed, employees, { clientId, clientName });
    const rows = exportRows(preview);
    if (!rows.length) {
      throw new AppError(
        400,
        'No employees matched. Choose the client this register belongs to and check the soft codes.',
      );
    }

    const now = new Date();
    const month = period?.month ?? parsed.detectedMonth ?? now.getMonth() + 1;
    const year = period?.year ?? parsed.detectedYear ?? now.getFullYear();
    const workbook = await buildMonthlyWorkbook(rows);
    return {
      buffer: workbook,
      filename: `attendance-template-${year}-${String(month).padStart(2, '0')}.xlsx`,
    };
  }
}

export const documentFormatterService = new DocumentFormatterService();
