import { Response } from 'express';
import { sendNoContent, sendSuccess } from '../../common/response';
import { AuthenticatedUser } from '../../types';
import { DeleteActionContext, DeleteActionResult } from './delete-requests.types';

export function sendDeleteActionResult(res: Response, result: DeleteActionResult): void {
  if (result.action === 'pending_approval') {
    sendSuccess(
      res,
      {
        message: result.message,
        requestId: result.requestId,
        status: 'pending',
      },
      202,
    );
    return;
  }

  sendNoContent(res);
}

export function toDeleteActionContext(
  user: AuthenticatedUser | undefined,
  reason?: string,
): DeleteActionContext {
  if (!user) {
    throw new Error('Authenticated user required for delete action');
  }

  return {
    userId: user.userId,
    username: user.username,
    roles: user.roles,
    reason,
  };
}
