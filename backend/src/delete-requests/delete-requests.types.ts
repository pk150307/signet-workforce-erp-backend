export interface DeleteRequestListItem {
  id: string;
  module: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  reason: string;
  status: string;
  requestedBy: string;
  requestedByName: string | null;
  requestedByEmail: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  rejectionRemarks: string | null;
  reviewedAt: string | null;
  softDeletedAt: string | null;
  createdAt: string;
  createdBy: string;
}

export interface DeleteRequestDetail extends DeleteRequestListItem {
  entitySnapshot: Record<string, unknown> | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DeleteRequestFilter {
  page: number;
  pageSize: number;
  status?: string;
  module?: string;
  entityType?: string;
  requestedBy?: string;
  reviewedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateDeleteRequestInput {
  module: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  reason: string;
  entitySnapshot?: Record<string, unknown> | null;
  requestedByUserId: string;
  createdBy: string;
}

export interface ReviewDeleteRequestInput {
  id: string;
  reviewedByUserId: string;
  reviewedByUsername: string;
  rejectionRemarks?: string;
}

export interface DeleteActionContext {
  userId: string;
  username: string;
  roles: string[];
  reason?: string;
}

export type DeleteActionResult =
  | { action: 'deleted' }
  | { action: 'pending_approval'; requestId: string; message: string };
