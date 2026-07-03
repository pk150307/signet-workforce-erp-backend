import { Request, Response } from 'express';
import { documentsService } from './documents.service';
import { DocumentType } from './documents.types';
import { sendSuccess } from '../../common/response';
import { AppError, NotFoundError } from '../../common/errors';
import { respondWithFileDownload } from './document-download';
import { documentsRepository } from './documents.repository';

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

  async download(req: Request, res: Response): Promise<void> {
    const documentId = String(req.params.id);
    const document = await documentsRepository.getDocument(documentId);
    if (!document) {
      throw new NotFoundError('Document', documentId);
    }

    const inline = req.query.inline === 'true' || req.query.inline === '1';
    await respondWithFileDownload(
      req,
      res,
      document.file_path,
      {
        fileName: document.file_name,
        mimeType: document.mime_type ?? 'application/octet-stream',
      },
      { inline },
    );
  }
}

export const documentsController = new DocumentsController();
