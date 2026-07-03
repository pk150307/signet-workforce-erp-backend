export interface DesignationGradeListItem {
  id: string;
  clientId?: string;
  clientName?: string;
  designationId: string;
  designationCode: string;
  designationName: string;
  departmentId: string;
  departmentName: string;
  gradeCode: string;
  gradeName: string;
  level: number;
  basicSalary: number;
  houseRentAllowance: number;
  specialAllowance: number;
  grossSalary: number;
  isPfApplicable: boolean;
  isEsiApplicable: boolean;
  employeePfPercentage: number;
  employeeEsiPercentage: number;
  employerPfPercentage: number;
  employerEsiPercentage: number;
  isLwfApplicable: boolean;
  employeeLwfPercentage: number;
  employeeLwfMaxAmount: number;
  employeeCount: number;
  isActive: boolean;
}

export interface DesignationGradeDetail extends DesignationGradeListItem {}

export interface CreateDesignationGradeInput {
  designationId: string;
  gradeCode: string;
  gradeName: string;
  level?: number;
  basicSalary?: number;
  houseRentAllowance?: number;
  specialAllowance?: number;
  isPfApplicable?: boolean;
  isEsiApplicable?: boolean;
  employeePfPercentage?: number;
  employeeEsiPercentage?: number;
  employerPfPercentage?: number;
  employerEsiPercentage?: number;
  isLwfApplicable?: boolean;
  employeeLwfPercentage?: number;
  employeeLwfMaxAmount?: number;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateDesignationGradeInput extends CreateDesignationGradeInput {
  id: string;
}

export interface DesignationGradeFilter {
  page: number;
  pageSize: number;
  clientId?: string;
  designationId?: string;
  departmentId?: string;
  search?: string;
  isActive?: boolean;
}

export interface ClientDesignationGradeRate {
  designationGradeId: string;
  gradeCode: string;
  gradeName: string;
  designationId: string;
  designationName: string;
  departmentId: string;
  departmentName: string;
  ratePerDay: number | null;
  ratePerMonth: number | null;
}

export interface ClientDesignationGradeRateInput {
  designationGradeId: string;
  ratePerDay?: number | null;
  ratePerMonth?: number | null;
}

export function computeGradeGross(grade: {
  basicSalary: number;
  houseRentAllowance: number;
  specialAllowance: number;
}): number {
  return grade.basicSalary + grade.houseRentAllowance + grade.specialAllowance;
}
