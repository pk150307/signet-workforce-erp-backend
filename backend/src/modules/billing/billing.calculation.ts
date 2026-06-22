import { AttendanceStatus } from '../../types/enums';
import { round2 } from '../../utils/formatters';
import {
  StatutoryContributionConfig,
  computeEmployerEsi,
  computeEmployerPf,
} from '../statutory/statutory.calculation';

export const EMPLOYER_PF_RATE = 0.12;
export const EMPLOYER_ESI_RATE = 0.0325;
export const ESI_GROSS_CEILING = 21000;
export const DEFAULT_HSN_SAC = '998519';

export interface SiteEmployeeBillingRow {
  employeeId: string;
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationName: string;
  designationGradeId: string | null;
  gradeCode: string | null;
  gradeName: string | null;
  basicSalary: number;
  grossSalary: number;
  statutoryConfig: StatutoryContributionConfig;
  presentDays: number;
  overtimePay: number;
  nightAllowance: number;
  punctualityAward: number;
}

export interface DepartmentBillingAggregate {
  departmentId: string;
  departmentName: string;
  headcount: number;
  manDays: number;
  overtimePay: number;
  nightAllowance: number;
  punctualityAward: number;
  basicEarned: number;
  grossEarned: number;
  employerPf: number;
  employerEsi: number;
}

export interface DesignationGradeBillingAggregate {
  departmentId: string;
  departmentName: string;
  designationId: string;
  designationName: string;
  designationGradeId: string;
  gradeCode: string;
  gradeName: string;
  headcount: number;
  manDays: number;
  overtimePay: number;
  nightAllowance: number;
  punctualityAward: number;
  basicEarned: number;
  grossEarned: number;
  employerPf: number;
  employerEsi: number;
}

export function countBillableDays(status: number): number {
  if (status === AttendanceStatus.Present || status === AttendanceStatus.Late || status === AttendanceStatus.EarlyOut) {
    return 1;
  }
  if (status === AttendanceStatus.HalfDay) return 0.5;
  return 0;
}

export function computeBasicEarned(basicSalary: number, workingDays: number, presentDays: number): number {
  if (workingDays <= 0) return 0;
  return round2((basicSalary / workingDays) * presentDays);
}

export function computeGrossEarned(grossSalary: number, workingDays: number, presentDays: number): number {
  if (workingDays <= 0) return 0;
  return round2((grossSalary / workingDays) * presentDays);
}

export function computeBillingGrossEarned(
  emp: SiteEmployeeBillingRow,
  workingDays: number,
): number {
  const proRatedGross = computeGrossEarned(emp.grossSalary, workingDays, emp.presentDays);
  return round2(proRatedGross + emp.nightAllowance + emp.punctualityAward + emp.overtimePay);
}

/** @deprecated Use computeEmployerPf with StatutoryContributionConfig */
export function computeEmployerPfLegacy(basicEarned: number, applicable: boolean): number {
  if (!applicable || basicEarned <= 0) return 0;
  return round2(basicEarned * EMPLOYER_PF_RATE);
}

/** @deprecated Use computeEmployerEsi with StatutoryContributionConfig */
export function computeEmployerEsiLegacy(grossSalary: number, grossEarned: number, applicable: boolean): number {
  if (!applicable || grossEarned <= 0 || grossSalary > ESI_GROSS_CEILING) return 0;
  return round2(grossEarned * EMPLOYER_ESI_RATE);
}

export function computeOvertimeBillingRate(dailyBillingRate: number): number {
  if (dailyBillingRate <= 0) return 0;
  return round2((dailyBillingRate / 8) * 2);
}

export function aggregateByDepartment(
  employees: SiteEmployeeBillingRow[],
  workingDays: number,
): DepartmentBillingAggregate[] {
  const map = new Map<string, DepartmentBillingAggregate>();

  for (const emp of employees) {
    const key = emp.departmentId;
    const basicEarned = computeBasicEarned(emp.basicSalary, workingDays, emp.presentDays);
    const grossEarned = computeBillingGrossEarned(emp, workingDays);
    const employerPf = computeEmployerPf(basicEarned, emp.statutoryConfig);
    const employerEsi = computeEmployerEsi(grossEarned, emp.grossSalary, emp.statutoryConfig);

    const existing = map.get(key);
    if (existing) {
      existing.headcount += 1;
      existing.manDays = round2(existing.manDays + emp.presentDays);
      existing.overtimePay = round2(existing.overtimePay + emp.overtimePay);
      existing.nightAllowance = round2(existing.nightAllowance + emp.nightAllowance);
      existing.punctualityAward = round2(existing.punctualityAward + emp.punctualityAward);
      existing.basicEarned = round2(existing.basicEarned + basicEarned);
      existing.grossEarned = round2(existing.grossEarned + grossEarned);
      existing.employerPf = round2(existing.employerPf + employerPf);
      existing.employerEsi = round2(existing.employerEsi + employerEsi);
      continue;
    }

    map.set(key, {
      departmentId: emp.departmentId,
      departmentName: emp.departmentName,
      headcount: 1,
      manDays: round2(emp.presentDays),
      overtimePay: round2(emp.overtimePay),
      nightAllowance: round2(emp.nightAllowance),
      punctualityAward: round2(emp.punctualityAward),
      basicEarned,
      grossEarned,
      employerPf,
      employerEsi,
    });
  }

  return [...map.values()].sort((a, b) => a.departmentName.localeCompare(b.departmentName));
}

export function aggregateByDesignationGrade(
  employees: SiteEmployeeBillingRow[],
  workingDays: number,
): DesignationGradeBillingAggregate[] {
  const map = new Map<string, DesignationGradeBillingAggregate>();

  for (const emp of employees) {
    if (!emp.designationGradeId) continue;
    const key = emp.designationGradeId;
    const basicEarned = computeBasicEarned(emp.basicSalary, workingDays, emp.presentDays);
    const grossEarned = computeBillingGrossEarned(emp, workingDays);
    const employerPf = computeEmployerPf(basicEarned, emp.statutoryConfig);
    const employerEsi = computeEmployerEsi(grossEarned, emp.grossSalary, emp.statutoryConfig);

    const existing = map.get(key);
    if (existing) {
      existing.headcount += 1;
      existing.manDays = round2(existing.manDays + emp.presentDays);
      existing.overtimePay = round2(existing.overtimePay + emp.overtimePay);
      existing.nightAllowance = round2(existing.nightAllowance + emp.nightAllowance);
      existing.punctualityAward = round2(existing.punctualityAward + emp.punctualityAward);
      existing.basicEarned = round2(existing.basicEarned + basicEarned);
      existing.grossEarned = round2(existing.grossEarned + grossEarned);
      existing.employerPf = round2(existing.employerPf + employerPf);
      existing.employerEsi = round2(existing.employerEsi + employerEsi);
      continue;
    }

    map.set(key, {
      departmentId: emp.departmentId,
      departmentName: emp.departmentName,
      designationId: emp.designationId,
      designationName: emp.designationName,
      designationGradeId: emp.designationGradeId,
      gradeCode: emp.gradeCode ?? '',
      gradeName: emp.gradeName ?? '',
      headcount: 1,
      manDays: round2(emp.presentDays),
      overtimePay: round2(emp.overtimePay),
      nightAllowance: round2(emp.nightAllowance),
      punctualityAward: round2(emp.punctualityAward),
      basicEarned,
      grossEarned,
      employerPf,
      employerEsi,
    });
  }

  return [...map.values()].sort((a, b) => {
    const dept = a.departmentName.localeCompare(b.departmentName);
    if (dept !== 0) return dept;
    const des = a.designationName.localeCompare(b.designationName);
    if (des !== 0) return des;
    return a.gradeCode.localeCompare(b.gradeCode);
  });
}
