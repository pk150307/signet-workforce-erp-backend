export interface DepartmentListItem {
  id: string;
  clientId: string;
  clientName?: string | null;
  departmentCode: string;
  departmentName: string;
  parentDepartmentName?: string | null;
  headOfDepartment?: string | null;
  employeeCount: number;
  isActive: boolean;
}

export interface DepartmentDetail extends DepartmentListItem {
  description?: string | null;
  parentDepartmentId?: string | null;
  headOfDepartmentId?: string | null;
}

export interface CreateDepartmentInput {
  clientId: string;
  departmentCode: string;
  departmentName: string;
  parentDepartmentId?: string | null;
  description?: string | null;
  headOfDepartmentId?: string | null;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateDepartmentInput extends Omit<CreateDepartmentInput, 'clientId'> {
  id: string;
}

export interface DepartmentFilter {
  page: number;
  pageSize: number;
  clientId?: string;
  search?: string;
  isActive?: boolean;
}
