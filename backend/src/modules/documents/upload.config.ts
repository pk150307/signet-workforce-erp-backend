import path from 'path';
import fs from 'fs';
import type { Request } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';
import { bucket, isS3Configured, s3 } from '../../config/s3';

const uploadRoot = path.isAbsolute(config.uploadPath)
  ? config.uploadPath
  : path.resolve(process.cwd(), config.uploadPath);

const subdirs = ['employees', 'documents', 'payslips', 'offer-letters', 'experience-letters'];

if (!isS3Configured) {
  for (const dir of subdirs) {
    const fullPath = path.join(uploadRoot, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

export type UploadedFile = Express.Multer.File & {
  location?: string;
  key?: string;
  bucket?: string;
};

function s3ObjectKey(category: string, originalname: string): string {
  return `${category}/${uuidv4()}${path.extname(originalname)}`;
}

function createDiskStorage(category: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(uploadRoot, category));
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  });
}

function createS3Storage(category: string) {
  return multerS3({
    s3,
    bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (_req, file, cb) => {
      cb(null, s3ObjectKey(category, file.originalname));
    },
  });
}

function createStorage(category: string) {
  return isS3Configured ? createS3Storage(category) : createDiskStorage(category);
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
  storage: createStorage('employees'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const documentUpload = multer({
  storage: createStorage('documents'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: documentFilter,
});

/** Accepts either `photo` (employee images) or `file` (general documents). */
export const upload = multer({
  storage: isS3Configured
    ? multerS3({
        s3,
        bucket,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, cb) => {
          cb(null, s3ObjectKey(resolveUploadCategory(req, file), file.originalname));
        },
      })
    : multer.diskStorage({
        destination: (req, file, cb) => {
          cb(null, path.join(uploadRoot, resolveUploadCategory(req, file)));
        },
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
        },
      }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: documentFilter,
});

export function getPublicUrl(filePathOrUrl: string): string {
  if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
    return filePathOrUrl;
  }
  return `${config.publicBaseUrl}/${filePathOrUrl.replace(/\\/g, '/')}`;
}

export function getUploadedFileUrl(file: UploadedFile): string {
  if (file.location) {
    return file.location;
  }
  if (file.key) {
    const region = process.env.AWS_REGION ?? 'ap-south-1';
    return `https://${bucket}.s3.${region}.amazonaws.com/${file.key}`;
  }
  if (file.path) {
    const relative = path.relative(uploadRoot, file.path).replace(/\\/g, '/');
    return getPublicUrl(relative);
  }
  return getPublicUrl(file.filename);
}

export function getUploadedFileKey(file: UploadedFile): string {
  if (file.key) {
    return file.key;
  }
  if (file.path) {
    return path.relative(uploadRoot, file.path).replace(/\\/g, '/');
  }
  return file.filename;
}

export function isRemoteFilePath(filePath: string): boolean {
  return filePath.startsWith('http://') || filePath.startsWith('https://');
}

export { uploadRoot };
