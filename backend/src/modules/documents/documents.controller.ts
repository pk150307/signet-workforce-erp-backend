import { Request, Response } from 'express';
import { documentsService } from './documents.service';
import { DocumentType } from './documents.types';
import { sendSuccess } from '../../common/response';
import { AppError } from '../../common/errors';

export class DocumentsController {
  async upload(req: Request, res: Response): Promise<void> {
    const file = req.file ?? (req.files as Express.Multer.File[] | undefined)?.[0];
    if (!file) {
      throw new AppError(400, 'No file uploaded');
    }

    const entityType = (req.body.entityType as string) ?? 'general';
    const entityId = (req.body.entityId as string) ?? null;
    const documentType = parseInt(String(req.body.documentType ?? DocumentType.Other), 10) as DocumentType;

    const result = await documentsService.upload({
      file,
      entityType,
      entityId,
      documentType,
      createdBy: req.user?.username ?? 'System',
    });

    sendSuccess(res, result);
  }
}

export const documentsController = new DocumentsController();
