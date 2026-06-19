import { documentsRepository } from './documents.repository';
import { DocumentType, UploadDocumentInput, UploadDocumentResult } from './documents.types';
import { getPublicUrl } from './upload.config';
import { NotFoundError } from '../../common/errors';

export class DocumentsService {
  async upload(input: UploadDocumentInput): Promise<UploadDocumentResult> {
    const isPhotoField = input.file.fieldname === 'photo';
    const isEmployeePhoto =
      input.entityType === 'employee' &&
      input.entityId &&
      (isPhotoField || input.documentType === DocumentType.ProfilePhoto);

    const category = isPhotoField || isEmployeePhoto ? 'employees' : 'documents';
    const relativePath = `${category}/${input.file.filename}`;
    const url = getPublicUrl(relativePath);

    if (isEmployeePhoto && input.entityId) {
      const exists = await documentsRepository.employeeExists(input.entityId);
      if (!exists) {
        throw new NotFoundError('Employee', input.entityId);
      }
      await documentsRepository.updateEmployeePhoto(input.entityId, url, input.createdBy);
    }

    const id = await documentsRepository.createDocument({
      entityType: input.entityType,
      entityId: input.entityId,
      documentType: input.documentType,
      fileName: input.file.originalname,
      filePath: relativePath,
      mimeType: input.file.mimetype,
      fileSize: input.file.size,
      createdBy: input.createdBy,
    });

    const result: UploadDocumentResult = { id, url, fileName: input.file.originalname };
    if (isEmployeePhoto) {
      result.profilePhotoUrl = url;
    }
    return result;
  }
}

export const documentsService = new DocumentsService();
