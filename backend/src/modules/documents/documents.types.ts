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
  downloadUrl: string;
  fileName: string;
  profilePhotoUrl?: string;
}

export interface SignedDownloadResponse {
  url: string;
  fileName?: string;
  expiresInSeconds: number;
  source: 's3' | 'disk';
}

export interface StoredDocumentRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  document_type: number;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: Date;
  created_by: string;
}
