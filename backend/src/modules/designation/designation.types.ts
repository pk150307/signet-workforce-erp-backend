export interface DesignationListItem {
  id: string;
  designationCode: string;
  designationName: string;
  parentDesignationName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  departmentName?: string | null;
  departmentId?: string | null;
  gradeCount: number;
  employeeCount: number;
  isActive: boolean;
}

export interface DesignationDetail extends DesignationListItem {
  description?: string | null;
  parentDesignationId?: string | null;
}

export interface CreateDesignationInput {
  designationCode: string;
  designationName: string;
  parentDesignationId?: string | null;
  departmentId: string;
  description?: string | null;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateDesignationInput extends CreateDesignationInput {
  id: string;
}

export interface DesignationFilter {
  page: number;
  pageSize: number;
  clientId?: string;
  search?: string;
  departmentId?: string;
  gradeCode?: string;
  isActive?: boolean;
}
