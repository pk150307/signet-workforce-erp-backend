import { billingReportsRepository } from './billing-reports.repository';
import {
  BillingCollectionsFilter,
  BillingGstFilter,
  BillingOutstandingFilter,
  BillingReportFilter,
} from './billing-reports.types';

function withPeriodDefaults<T extends BillingReportFilter>(filter: T): T {
  const now = new Date();
  const hasPeriod = filter.month || filter.year || filter.fromDate || filter.toDate;
  if (hasPeriod) return filter;
  return { ...filter, month: now.getMonth() + 1, year: now.getFullYear() };
}

export class BillingReportsService {
  getPeriodSummary(filter: BillingReportFilter) {
    return billingReportsRepository.getPeriodSummary(withPeriodDefaults(filter));
  }

  getOutstandingReport(filter: BillingOutstandingFilter) {
    return billingReportsRepository.getOutstandingReport(filter);
  }

  getCollectionsReport(filter: BillingCollectionsFilter) {
    return billingReportsRepository.getCollectionsReport(withPeriodDefaults(filter));
  }

  getGstReport(filter: BillingGstFilter) {
    return billingReportsRepository.getGstReport(withPeriodDefaults(filter));
  }
}

export const billingReportsService = new BillingReportsService();
