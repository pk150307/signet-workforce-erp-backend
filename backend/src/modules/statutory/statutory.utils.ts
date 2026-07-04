import { Request } from 'express';
import { StatutoryFilter, PfEsicStatus } from './statutory.types';
import { EmployeeLifecycleStatus } from '../employee/employee.constants';

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

function parseEmployeeStatusFilter(value: unknown): StatutoryFilter['employeeStatus'] {
  if (value === 'all') return 'all';
  if (value !== undefined && value !== '') {
    return Number(value);
  }
  return EmployeeLifecycleStatus.Active;
}

export function parseStatutoryFilter(req: Request): StatutoryFilter {
  return {
    pageSize: Number(req.query.pageSize) || 10,
    cursor: req.query.cursor as string | undefined,
    direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
    search: req.query.search as string | undefined,
    siteId: req.query.siteId as string | undefined,
    clientId: req.query.clientId as string | undefined,
    status: req.query.status as PfEsicStatus | undefined,
    employeeStatus: parseEmployeeStatusFilter(req.query.employeeStatus),
    department: req.query.department as string | undefined,
    hasUan: parseOptionalBool(req.query.hasUan),
    hasPf: parseOptionalBool(req.query.hasPf),
    hasEsic: parseOptionalBool(req.query.hasEsic),
    sortBy: req.query.sortBy as string | undefined,
    sortDir: req.query.sortDir === 'desc' ? 'desc' : req.query.sortDir === 'asc' ? 'asc' : undefined,
    pfApplicable: parseOptionalBool(req.query.pfApplicable),
    esiApplicable: parseOptionalBool(req.query.esiApplicable),
  };
}
