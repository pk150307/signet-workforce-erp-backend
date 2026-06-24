import fs from 'fs';
import path from 'path';
import { GetObjectCommand, S3ServiceException } from '@aws-sdk/client-s3';
import { config } from '../../config';
import {
  bucket,
  describeS3AccessError,
  getS3Client,
  getStorageBackend,
  isS3Configured,
  resolveS3Key,
  StorageBackend,
  verifyS3Access,
} from '../../config/s3';
import { logger } from '../../utils/logger';

export interface StoredFileContent {
  data: Buffer;
  contentType: string;
}

let activeBackend: StorageBackend | null = null;
let storageInitError: string | null = null;

function getUploadRootCandidates(): string[] {
  const configured = config.uploadPath;
  if (path.isAbsolute(configured)) {
    return [configured];
  }

  return [
    path.resolve(process.cwd(), configured),
    path.resolve(process.cwd(), '..', configured),
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
}

export function resolveUploadRoot(): string {
  for (const candidate of getUploadRootCandidates()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const root = getUploadRootCandidates()[0];
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export const uploadRoot = resolveUploadRoot();

/** Backend selected at startup after verifying S3 connectivity. */
export function getActiveStorageBackend(): StorageBackend {
  return activeBackend ?? getStorageBackend();
}

export function getStorageStatus(): {
  backend: StorageBackend;
  bucket: string | null;
  region: string | null;
  uploadRoot: string;
  error: string | null;
} {
  return {
    backend: getActiveStorageBackend(),
    bucket: isS3Configured ? bucket : null,
    region: config.aws.region ?? null,
    uploadRoot,
    error: storageInitError,
  };
}

function isRemoteFilePath(filePath: string): boolean {
  return filePath.startsWith('http://') || filePath.startsWith('https://');
}

/** Normalize any DB value to a storage key such as documents/uuid.pdf */
export function normalizeStorageKey(stored: string): string {
  if (isRemoteFilePath(stored)) {
    const s3Key = resolveS3Key(stored);
    if (s3Key) {
      return s3Key;
    }

    const base = config.publicBaseUrl.replace(/\/$/, '');
    if (stored.startsWith(base)) {
      return stored.slice(base.length).replace(/^\//, '').replace(/\\/g, '/');
    }

    try {
      const parsed = new URL(stored);
      const uploadsMatch = parsed.pathname.match(/\/uploads\/(.+)$/);
      if (uploadsMatch?.[1]) {
        return uploadsMatch[1];
      }
    } catch {
      // ignore malformed URLs
    }
  }

  return stored.replace(/^\//, '').replace(/\\/g, '/');
}

export function resolveDiskPath(key: string): string | null {
  const relative = normalizeStorageKey(key);
  for (const root of getUploadRootCandidates()) {
    const diskPath = path.join(root, relative);
    if (fs.existsSync(diskPath)) {
      return diskPath;
    }
  }
  return null;
}

async function readFromS3(key: string): Promise<StoredFileContent | null> {
  try {
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      return null;
    }

    return {
      data: Buffer.from(await response.Body.transformToByteArray()),
      contentType: response.ContentType ?? 'application/octet-stream',
    };
  } catch (error) {
    if (error instanceof S3ServiceException) {
      if (['NoSuchKey', 'NotFound'].includes(error.name)) {
        return null;
      }
      if (error.name === 'AccessDenied') {
        throw error;
      }
    }
    throw error;
  }
}

function readFromDisk(key: string): StoredFileContent | null {
  const diskPath = resolveDiskPath(key);
  if (!diskPath) {
    return null;
  }

  return {
    data: fs.readFileSync(diskPath),
    contentType: 'application/octet-stream',
  };
}

export async function readStoredFile(stored: string): Promise<StoredFileContent | null> {
  const key = normalizeStorageKey(stored);

  if (getActiveStorageBackend() === 's3' && isS3Configured) {
    try {
      const fromS3 = await readFromS3(key);
      if (fromS3) {
        return fromS3;
      }
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === 'AccessDenied') {
        throw error;
      }
      logger.warn('S3 read failed, trying local disk fallback', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const fromDisk = readFromDisk(stored);
  if (fromDisk) {
    return fromDisk;
  }

  // Legacy files uploaded to S3 before a disk fallback — try S3 when credentials work.
  if (isS3Configured) {
    try {
      return await readFromS3(key);
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === 'AccessDenied') {
        throw error;
      }
      logger.warn('S3 legacy read failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return null;
}

export async function initializeStorage(): Promise<void> {
  if (!isS3Configured) {
    activeBackend = 'disk';
    ensureDiskSubdirs();
    logger.info('File storage: local disk', { uploadRoot });
    return;
  }

  try {
    await verifyS3Access();
    activeBackend = 's3';
    storageInitError = null;
    logger.info('File storage: S3', { bucket, region: config.aws.region });
  } catch (error) {
    storageInitError = describeS3AccessError(error);

    if (config.isProduction) {
      throw new Error(
        `S3 storage is configured but not accessible. ${storageInitError} ` +
          'Fix AWS credentials/permissions or unset AWS_* variables to use disk storage.',
      );
    }

    activeBackend = 'disk';
    ensureDiskSubdirs();
    console.warn('[startup] ⚠️  S3 credentials are invalid or lack permissions — using local disk storage');
    console.warn(`[startup]    ${storageInitError}`);
    logger.warn('S3 unavailable, falling back to local disk storage', { error: storageInitError, uploadRoot });
  }
}

function ensureDiskSubdirs(): void {
  for (const dir of ['employees', 'documents', 'payslips', 'offer-letters', 'experience-letters']) {
    const fullPath = path.join(uploadRoot, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}
