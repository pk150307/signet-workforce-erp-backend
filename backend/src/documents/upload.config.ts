import path from 'path';
import fs from 'fs';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';
import {
  bucket,
  getS3Client,
  resolveS3Key,
} from '../../config/s3';
import { getActiveStorageBackend, uploadRoot } from './storage.service';

const subdirs = ['employees', 'documents', 'payslips', 'offer-letters', 'experience-letters'];

function ensureDiskSubdirs(): void {
  for (const dir of subdirs) {
    const fullPath = path.join(uploadRoot, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

if (getActiveStorageBackend() === 'disk') {
  ensureDiskSubdirs();
}

export type UploadedFile = Express.Multer.File & {
  location?: string;
  key?: string;
  bucket?: string;
};

function s3ObjectKey(category: string, originalname: string): string {
  return `${category}/${uuidv4()}${path.extname(originalname)}`;
}

function createDiskStorage(category: string): StorageEngine {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDiskSubdirs();
      cb(null, path.join(uploadRoot, category));
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  });
}

function createS3Storage(category: string): StorageEngine {
  return multerS3({
    s3: getS3Client(),
    bucket,
    ...(process.env.S3_OBJECT_ACL ? { acl: process.env.S3_OBJECT_ACL } : {}),
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (_req, file, cb) => {
      cb(null, s3ObjectKey(category, file.originalname));
    },
  });
}

/** Pick S3 or disk at request time (after initializeStorage has run). */
function deferredStorage(category: string): StorageEngine {
  return {
    _handleFile(req, file, cb) {
      const storage =
        getActiveStorageBackend() === 's3' ? createS3Storage(category) : createDiskStorage(category);
      storage._handleFile(req, file, cb);
    },
    _removeFile(req, file, cb) {
      const storage =
        getActiveStorageBackend() === 's3' ? createS3Storage(category) : createDiskStorage(category);
      if (storage._removeFile) {
        storage._removeFile(req, file, cb);
      } else {
        cb(null);
      }
    },
  };
}

function resolveUploadCategory(req: Request, file: Express.Multer.File): string {
  const entityType = req.body?.entityType as string | undefined;
  const documentType = parseInt(String(req.body?.documentType ?? '0'), 10);
  return file.fieldname === 'photo' || (entityType === 'employee' && documentType === 1)
    ? 'employees'
    : 'documents';
}

const imageFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
};

const documentFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

export const photoUpload = multer({
  storage: deferredStorage('employees'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const documentUpload = multer({
  storage: deferredStorage('documents'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: documentFilter,
});

/** Accepts either `photo` (employee images) or `file` (general documents). */
export const upload = multer({
  storage: {
    _handleFile(req, file, cb) {
      const category = resolveUploadCategory(req, file);
      deferredStorage(category)._handleFile(req, file, cb);
    },
    _removeFile(req, file, cb) {
      const category = resolveUploadCategory(req, file);
      const storage = deferredStorage(category);
      if (storage._removeFile) {
        storage._removeFile(req, file, cb);
      } else {
        cb(null);
      }
    },
  },
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: documentFilter,
});

export function getPublicUrl(filePathOrUrl: string): string {
  if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
    return filePathOrUrl;
  }
  return `${config.publicBaseUrl}/${filePathOrUrl.replace(/\\/g, '/')}`;
}

/** Value persisted in the database (S3 key or disk-relative path). */
export function getStoredFileReference(file: UploadedFile): string {
  if (file.key) {
    return file.key;
  }
  if (file.path) {
    return path.relative(uploadRoot, file.path).replace(/\\/g, '/');
  }
  return file.filename;
}

/** Public URL returned to clients after upload (disk only). */
export function getUploadedFileUrl(file: UploadedFile): string {
  return resolveFileUrl(getStoredFileReference(file));
}

export function getUploadedFileKey(file: UploadedFile): string {
  return getStoredFileReference(file);
}

/** Resolve a stored file reference or legacy full URL to a client-facing URL. */
export function resolveFileUrl(stored: string | null | undefined): string {
  if (!stored) {
    return '';
  }
  if (isRemoteFilePath(stored)) {
    if (resolveS3Key(stored) && getActiveStorageBackend() === 's3') {
      return '';
    }
    if (!resolveS3Key(stored)) {
      return stored;
    }
  }
  if (getActiveStorageBackend() === 's3') {
    return '';
  }
  return getPublicUrl(stored);
}

export function isRemoteFilePath(filePath: string): boolean {
  return filePath.startsWith('http://') || filePath.startsWith('https://');
}

export function isS3ObjectKey(stored: string): boolean {
  return Boolean(resolveS3Key(stored));
}

export { uploadRoot };
