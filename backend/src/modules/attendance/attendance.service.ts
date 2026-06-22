import { AppError } from '../../common/errors';
import { attendanceRepository } from './attendance.repository';
import {
  AttendanceCellUpdate,
  BulkMarkInput,
  LockRegisterInput,
  RegisterFilter,
  UnlockRegisterInput,
} from './attendance.types';

export class AttendanceService {
  getEmployeeList(filter: RegisterFilter) {
    return attendanceRepository.getEmployeeList(filter);
  }

  getGrid(filter: RegisterFilter, user: string) {
    return attendanceRepository.getGrid(filter, user);
  }

  updateCells(
    clientId: string,
    month: number,
    year: number,
    updates: AttendanceCellUpdate[],
    user: string,
  ) {
    return attendanceRepository.updateCells(clientId, month, year, updates, user).then(() =>
      attendanceRepository.getGrid({ clientId, month, year }, user),
    );
  }

  submitEmployeeRow(
    clientId: string,
    month: number,
    year: number,
    employeeId: string,
    cells: Array<{ date: string; status: number | null }>,
    user: string,
    extras: { overtimeHours?: number; nightAllowance?: number; punctualityAward?: number } = {},
  ) {
    return attendanceRepository.submitEmployeeRow(
      clientId,
      month,
      year,
      employeeId,
      cells,
      user,
      {
        overtimeHours: extras.overtimeHours ?? 0,
        nightAllowance: extras.nightAllowance ?? 0,
        punctualityAward: extras.punctualityAward ?? 0,
      },
    );
  }

  bulkMark(input: BulkMarkInput, user: string) {
    return attendanceRepository.bulkMark(input, user).then((updated) =>
      attendanceRepository.getGrid(
        { clientId: input.clientId, month: input.month, year: input.year },
        user,
      ).then((grid) => ({ updated, grid })),
    );
  }

  previewImportBuffer(
    clientId: string,
    month: number,
    year: number,
    buffer: Buffer,
    filename: string,
  ) {
    return attendanceRepository.previewImportBuffer(clientId, month, year, buffer, filename);
  }

  applyImportBuffer(
    clientId: string,
    month: number,
    year: number,
    buffer: Buffer,
    filename: string,
    user: string,
  ) {
    return attendanceRepository.applyImportBuffer(clientId, month, year, buffer, filename, user);
  }

  buildImportTemplate(
    clientId: string,
    month: number,
    year: number,
    user: string,
  ) {
    return attendanceRepository.buildRegisterWorkbook(clientId, month, year, user, false);
  }

  exportRegister(
    clientId: string,
    month: number,
    year: number,
    user: string,
  ) {
    return attendanceRepository.buildRegisterWorkbook(clientId, month, year, user, true);
  }

  lockRegister(input: LockRegisterInput, user: string) {
    if (!input.verified) {
      throw new AppError(400, 'Verification confirmation is required before locking.');
    }
    return attendanceRepository.lockRegister(input.clientId, input.month, input.year, user);
  }

  unlockRegister(input: UnlockRegisterInput, user: string) {
    return attendanceRepository.unlockRegister(
      input.clientId,
      input.month,
      input.year,
      input.reason,
      user,
    );
  }

  getUnlockHistory(clientId: string, month: number, year: number) {
    return attendanceRepository.getUnlockHistory(clientId, month, year);
  }

  getEmployeeCalendar(employeeId: string, month: number, year: number) {
    return attendanceRepository.getEmployeeCalendar(employeeId, month, year);
  }
}

export const attendanceService = new AttendanceService();
