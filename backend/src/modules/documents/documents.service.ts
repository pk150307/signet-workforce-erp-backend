import { documentsRepository } from './documents.repository';
import { DocumentType, UploadDocumentInput, UploadDocumentResult } from './documents.types';
import { getUploadedFileKey, UploadedFile } from './upload.config';
import { NotFoundError } from '../../common/errors';
import {
  createSignedDownloadUrl,
  SignedDownloadResult,
} from './signed-url.service';

export class DocumentsService {
  async upload(input: UploadDocumentInput): Promise<UploadDocumentResult> {
    const file = input.file as UploadedFile;
    const isPhotoField = file.fieldname === 'photo';
    const isEmployeePhoto =
      input.entityType === 'employee' &&
      input.entityId &&
      (isPhotoField || input.documentType === DocumentType.ProfilePhoto);

    const fileKey = getUploadedFileKey(file);

    if (isEmployeePhoto && input.entityId) {
      const exists = await documentsRepository.employeeExists(input.entityId);
      if (!exists) {
        throw new NotFoundError('Employee', input.entityId);
      }
      await documentsRepository.updateEmployeePhoto(input.entityId, fileKey, input.createdBy);
    }

    const id = await documentsRepository.createDocument({
      entityType: input.entityType,
      entityId: input.entityId,
      documentType: input.documentType,
      fileName: file.originalname,
      filePath: fileKey,
      mimeType: file.mimetype,
      fileSize: file.size,
      createdBy: input.createdBy,
    });

    const downloadUrl = `/api/documents/${id}/download`;
    const result: UploadDocumentResult = {
      id,
      url: downloadUrl,
      downloadUrl,
      fileName: file.originalname,
    };

    if (isEmployeePhoto && input.entityId) {
      result.profilePhotoUrl = `/api/employees/${input.entityId}/photo/download`;
    }

    return result;
  }

  async getSignedDownloadUrl(documentId: string, inline = false): Promise<SignedDownloadResult> {
    const document = await documentsRepository.getDocument(documentId);
    if (!document) {
      throw new NotFoundError('Document', documentId);
    }

    const signed = await createSignedDownloadUrl(document.file_path, {
      fileName: document.file_name,
      inline,
    });

    if (!signed) {
      throw new NotFoundError('Document file', documentId);
    }

    return signed;
  }
}

export const documentsService = new DocumentsService();
