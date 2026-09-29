import { reportsRepository } from './reports.repository';
import { ReportFilter } from './reports.types';

export class ReportsService {
  getAttendance(filter: ReportFilter) {
    return reportsRepository.getAttendanceReport(filter);
  }

  getPayroll(filter: ReportFilter) {
    return reportsRepository.getPayrollReport(filter);
  }

  getInvoices(filter: ReportFilter) {
    return reportsRepository.getInvoiceReport(filter);
  }

  getEmployees(filter: ReportFilter) {
    return reportsRepository.getEmployeeReport(filter);
  }
}

export const reportsService = new ReportsService();
