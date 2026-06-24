import { ConflictError, NotFoundError, ValidationError } from '../../common/errors';
import { writeAuditLog, AUDIT_ACTION } from '../iam/audit.service';
import {
  DELETE_REQUEST_STATUS,
  IAM_MODULES,
  IAM_SYSTEM_ROLES,
  NOTIFICATION_TYPE,
} from '../iam/iam.constants';
import { getDeleteExecutor } from './delete-executors';
import { deleteRequestsRepository } from './delete-requests.repository';
import { notificationService } from '../notification/notification.service';
import {
  CreateDeleteRequestInput,
  DeleteActionContext,
  DeleteActionResult,
  DeleteRequestDetail,
  DeleteRequestFilter,
  ReviewDeleteRequestInput,
} from './delete-requests.types';

export interface HandleDeleteInput {
  module: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  entitySnapshot?: Record<string, unknown> | null;
  context: DeleteActionContext;
}

function requiresDeleteApproval(roles: string[]): boolean {
  const isSuperAdmin = roles.includes(IAM_SYSTEM_ROLES.SUPER_ADMIN);
  const isHrManager = roles.includes(IAM_SYSTEM_ROLES.HR_MANAGER);
  return isHrManager && !isSuperAdmin;
}

export class DeleteApprovalService {
  requiresApproval(roles: string[]): boolean {
    return requiresDeleteApproval(roles);
  }

  async handleDelete(input: HandleDeleteInput): Promise<DeleteActionResult> {
    const { context } = input;

    if (requiresDeleteApproval(context.roles)) {
      if (!context.reason?.trim()) {
        throw new ValidationError(
          { reason: ['A reason is required when submitting a delete request.'] },
          'Delete reason required',
        );
      }

      const requestId = await this.submitRequest({
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        reason: context.reason.trim(),
        entitySnapshot: input.entitySnapshot,
        requestedByUserId: context.userId,
        createdBy: context.username,
      });

      return {
        action: 'pending_approval',
        requestId,
        message: 'Delete request submitted for Super Admin approval.',
      };
    }

    if (!getDeleteExecutor(input.module, input.entityType)) {
      throw new NotFoundError('Delete executor', `${input.module}.${input.entityType}`);
    }

    await this.executeSoftDelete(
      input.module,
      input.entityType,
      input.entityId,
      context.username,
      context.userId,
    );

    return { action: 'deleted' };
  }

  async submitRequest(input: CreateDeleteRequestInput): Promise<string> {
    const pending = await deleteRequestsRepository.hasPendingRequest(
      input.module,
      input.entityType,
      input.entityId,
    );
    if (pending) {
      throw new ConflictError(
        'A pending delete request already exists for this record.',
      );
    }

    const requestId = await deleteRequestsRepository.create(input);

    await writeAuditLog({
      userId: input.requestedByUserId,
      module: IAM_MODULES.DELETE_REQUESTS,
      action: AUDIT_ACTION.DELETE_REQUEST,
      entityType: 'DeleteRequest',
      entityId: requestId,
      newValues: {
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        reason: input.reason,
      },
      createdBy: input.createdBy,
    });

    await this.notifySuperAdmins({
      title: 'Delete approval required',
      message: `${input.createdBy} requested deletion of ${input.entityLabel ?? input.entityType} (${input.module}).`,
      referenceId: requestId,
      notificationType: NOTIFICATION_TYPE.DELETE_REQUEST_SUBMITTED,
      createdBy: input.createdBy,
    });

    return requestId;
  }

  async approve(input: ReviewDeleteRequestInput): Promise<DeleteRequestDetail> {
    const request = await deleteRequestsRepository.findById(input.id);
    if (!request) throw new NotFoundError('Delete request', input.id);
    if (request.status !== DELETE_REQUEST_STATUS.PENDING) {
      throw new ConflictError('Only pending delete requests can be approved.');
    }

    const executor = getDeleteExecutor(request.module, request.entityType);
    if (!executor) {
      throw new NotFoundError('Delete executor', `${request.module}.${request.entityType}`);
    }

    await executor(request.entityId, input.reviewedByUsername);
    await deleteRequestsRepository.approve(
      input.id,
      input.reviewedByUserId,
      input.reviewedByUsername,
    );

    await writeAuditLog({
      userId: input.reviewedByUserId,
      module: IAM_MODULES.DELETE_REQUESTS,
      action: AUDIT_ACTION.DELETE_APPROVE,
      entityType: 'DeleteRequest',
      entityId: input.id,
      newValues: {
        module: request.module,
        entityType: request.entityType,
        entityId: request.entityId,
      },
      createdBy: input.reviewedByUsername,
    });

    await writeAuditLog({
      userId: input.reviewedByUserId,
      module: request.module,
      action: AUDIT_ACTION.RECORD_DELETE,
      entityType: request.entityType,
      entityId: request.entityId,
      oldValues: request.entitySnapshot ?? undefined,
      createdBy: input.reviewedByUsername,
    });

    await notificationService.create({
      userId: request.requestedBy,
      title: 'Delete request approved',
      message: `Your delete request for ${request.entityLabel ?? request.entityType} was approved.`,
      link: `/settings/delete-approvals/${request.id}`,
      notificationType: NOTIFICATION_TYPE.DELETE_APPROVED,
      referenceType: 'delete_request',
      referenceId: request.id,
      createdBy: input.reviewedByUsername,
    });

    const updated = await deleteRequestsRepository.findById(input.id);
    return updated!;
  }

  async reject(input: ReviewDeleteRequestInput): Promise<DeleteRequestDetail> {
    if (!input.rejectionRemarks?.trim()) {
      throw new ValidationError(
        { rejectionRemarks: ['Rejection remarks are required.'] },
        'Rejection remarks required',
      );
    }

    const request = await deleteRequestsRepository.findById(input.id);
    if (!request) throw new NotFoundError('Delete request', input.id);
    if (request.status !== DELETE_REQUEST_STATUS.PENDING) {
      throw new ConflictError('Only pending delete requests can be rejected.');
    }

    await deleteRequestsRepository.reject(
      input.id,
      input.reviewedByUserId,
      input.reviewedByUsername,
      input.rejectionRemarks.trim(),
    );

    await writeAuditLog({
      userId: input.reviewedByUserId,
      module: IAM_MODULES.DELETE_REQUESTS,
      action: AUDIT_ACTION.DELETE_REJECT,
      entityType: 'DeleteRequest',
      entityId: input.id,
      newValues: {
        rejectionRemarks: input.rejectionRemarks.trim(),
        module: request.module,
        entityType: request.entityType,
        entityId: request.entityId,
      },
      createdBy: input.reviewedByUsername,
    });

    await notificationService.create({
      userId: request.requestedBy,
      title: 'Delete request rejected',
      message: `Your delete request for ${request.entityLabel ?? request.entityType} was rejected: ${input.rejectionRemarks.trim()}`,
      link: `/settings/delete-approvals/${request.id}`,
      notificationType: NOTIFICATION_TYPE.DELETE_REJECTED,
      referenceType: 'delete_request',
      referenceId: request.id,
      createdBy: input.reviewedByUsername,
    });

    const updated = await deleteRequestsRepository.findById(input.id);
    return updated!;
  }

  private async executeSoftDelete(
    module: string,
    entityType: string,
    entityId: string,
    deletedBy: string,
    userId: string,
  ): Promise<void> {
    const executor = getDeleteExecutor(module, entityType);
    if (!executor) {
      throw new NotFoundError('Delete executor', `${module}.${entityType}`);
    }

    await executor(entityId, deletedBy);

    await writeAuditLog({
      userId,
      module,
      action: AUDIT_ACTION.RECORD_DELETE,
      entityType,
      entityId,
      createdBy: deletedBy,
    });
  }

  private async notifySuperAdmins(input: {
    title: string;
    message: string;
    referenceId: string;
    notificationType: string;
    createdBy: string;
  }): Promise<void> {
    const adminIds = await deleteRequestsRepository.getSuperAdminUserIds();
    await notificationService.createMany(
      adminIds.map((userId) => ({
        userId,
        title: input.title,
        message: input.message,
        link: `/settings/delete-approvals/${input.referenceId}`,
        notificationType: input.notificationType,
        referenceType: 'delete_request',
        referenceId: input.referenceId,
        createdBy: input.createdBy,
      })),
    );
  }
}

export const deleteApprovalService = new DeleteApprovalService();

export class DeleteRequestsService {
  list(filter: DeleteRequestFilter) {
    return deleteRequestsRepository.findAll(filter);
  }

  async getById(id: string) {
    const item = await deleteRequestsRepository.findById(id);
    if (!item) throw new NotFoundError('Delete request', id);
    return item;
  }

  create(input: CreateDeleteRequestInput) {
    return deleteApprovalService.submitRequest(input);
  }

  approve(input: ReviewDeleteRequestInput) {
    return deleteApprovalService.approve(input);
  }

  reject(input: ReviewDeleteRequestInput) {
    return deleteApprovalService.reject(input);
  }
}

export const deleteRequestsService = new DeleteRequestsService();
