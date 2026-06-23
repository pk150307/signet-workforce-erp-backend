import { documentsRepository } from './documents.repository';
import { DocumentType, UploadDocumentInput, UploadDocumentResult } from './documents.types';
import { getStoredFileReference, getUploadedFileUrl, UploadedFile } from './upload.config';
import { NotFoundError } from '../../common/errors';

export class DocumentsService {
  async upload(input: UploadDocumentInput): Promise<UploadDocumentResult> {
    const file = input.file as UploadedFile;
    const isPhotoField = file.fieldname === 'photo';
    const isEmployeePhoto =
      input.entityType === 'employee' &&
      input.entityId &&
      (isPhotoField || input.documentType === DocumentType.ProfilePhoto);

    const fileRef = getStoredFileReference(file);
    const url = getUploadedFileUrl(file);

    if (isEmployeePhoto && input.entityId) {
      const exists = await documentsRepository.employeeExists(input.entityId);
      if (!exists) {
        throw new NotFoundError('Employee', input.entityId);
      }
      await documentsRepository.updateEmployeePhoto(input.entityId, fileRef, input.createdBy);
    }

    const id = await documentsRepository.createDocument({
      entityType: input.entityType,
      entityId: input.entityId,
      documentType: input.documentType,
      fileName: file.originalname,
      filePath: fileRef,
      mimeType: file.mimetype,
      fileSize: file.size,
      createdBy: input.createdBy,
    });

    const result: UploadDocumentResult = { id, url, fileName: file.originalname };
    if (isEmployeePhoto) {
      result.profilePhotoUrl = url;
    }
    return result;
  }
}

export const documentsService = new DocumentsService();
