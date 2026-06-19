import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config';

const uploadRoot = path.isAbsolute(config.uploadPath)
  ? config.uploadPath
  : path.resolve(process.cwd(), config.uploadPath);

const subdirs = ['employees', 'documents', 'payslips', 'offer-letters', 'experience-letters'];

for (const dir of subdirs) {
  const fullPath = path.join(uploadRoot, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
}

function createStorage(category: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, path.join(uploadRoot, category));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  });
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
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const entityType = req.body?.entityType as string | undefined;
      const documentType = parseInt(String(req.body?.documentType ?? '0'), 10);
      const category =
        file.fieldname === 'photo' || (entityType === 'employee' && documentType === 1)
          ? 'employees'
          : 'documents';
      cb(null, path.join(uploadRoot, category));
    },
    filename: (_req, file, cb) => {
      cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: documentFilter,
});

export function getPublicUrl(relativePath: string): string {
  return `${config.publicBaseUrl}/${relativePath.replace(/\\/g, '/')}`;
}

export { uploadRoot };
