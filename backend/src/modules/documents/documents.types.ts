export enum DocumentType {
  ProfilePhoto = 1,
  Kyc = 2,
  Payslip = 3,
  OfferLetter = 4,
  ExperienceLetter = 5,
  Other = 99,
}

export interface UploadDocumentInput {
  file: Express.Multer.File;
  entityType: string;
  entityId: string | null;
  documentType: DocumentType;
  createdBy: string;
}

export interface UploadDocumentResult {
  id: string;
  url: string;
  fileName: string;
  profilePhotoUrl?: string;
}
