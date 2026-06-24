import { GetObjectCommand, HeadBucketCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './index';
import { logger } from '../utils/logger';

export type StorageBackend = 's3' | 'disk';

export const isS3Configured = Boolean(
  config.aws.region &&
    config.aws.accessKeyId &&
    config.aws.secretAccessKey &&
    config.aws.bucketName,
);

export const bucket = config.aws.bucketName ?? '';

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!isS3Configured) {
    throw new Error('S3 is not configured');
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.aws.region!,
      credentials: {
        accessKeyId: config.aws.accessKeyId!,
        secretAccessKey: config.aws.secretAccessKey!,
      },
    });
  }
  return s3Client;
}

/** @deprecated Use getS3Client() — kept for multer-s3 compatibility */
export const s3 = new Proxy({} as S3Client, {
  get(_target, prop, receiver) {
    return Reflect.get(getS3Client(), prop, receiver);
  },
});

export function getStorageBackend(): StorageBackend {
  return isS3Configured ? 's3' : 'disk';
}

export function getStorageDiagnostics(): {
  backend: StorageBackend;
  bucket: string | null;
  region: string | null;
  missingEnv: string[];
} {
  const required = [
    ['AWS_REGION', config.aws.region],
    ['AWS_ACCESS_KEY_ID', config.aws.accessKeyId],
    ['AWS_SECRET_ACCESS_KEY', config.aws.secretAccessKey],
    ['AWS_BUCKET_NAME', config.aws.bucketName],
  ] as const;

  const missingEnv = required.filter(([, value]) => !value).map(([name]) => name);

  return {
    backend: getStorageBackend(),
    bucket: config.aws.bucketName ?? null,
    region: config.aws.region ?? null,
    missingEnv,
  };
}

export function buildS3ObjectUrl(key: string): string {
  const region = config.aws.region ?? 'ap-south-1';
  const normalizedKey = key.replace(/^\//, '');
  return `https://${bucket}.s3.${region}.amazonaws.com/${normalizedKey}`;
}

/** Extract object key from a virtual-hosted or path-style S3 URL. */
export function extractS3KeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('.s3.') || host.includes('.s3-')) {
      if (bucket && host.startsWith(`${bucket.toLowerCase()}.`)) {
        const key = parsed.pathname.replace(/^\//, '');
        return key || null;
      }
      const key = parsed.pathname.replace(/^\//, '');
      return key || null;
    }

    if (host.startsWith('s3.') || host === 's3.amazonaws.com') {
      const segments = parsed.pathname.replace(/^\//, '').split('/');
      if (segments.length >= 2 && (!bucket || segments[0] === bucket)) {
        return segments.slice(1).join('/') || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/** Time-limited HTTPS URL for private S3 objects. */
export async function getPresignedObjectUrl(
  key: string,
  expiresInSeconds = 3600,
  options: { inline?: boolean; fileName?: string } = {},
): Promise<string | null> {
  if (!isS3Configured || !key) {
    return null;
  }

  const normalizedKey = key.replace(/^\//, '');
  const disposition = options.fileName
    ? `${options.inline ? 'inline' : 'attachment'}; filename="${options.fileName.replace(/[^\w.\-() ]+/g, '_')}"`
    : options.inline
      ? 'inline'
      : undefined;

  try {
    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: bucket,
        Key: normalizedKey,
        ...(disposition ? { ResponseContentDisposition: disposition } : {}),
        ...(options.fileName && options.fileName.endsWith('.pdf')
          ? { ResponseContentType: 'application/pdf' }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  } catch (error) {
    logger.warn('Failed to create presigned S3 URL', {
      key: normalizedKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Human-readable message for S3 permission / credential problems. */
export function describeS3AccessError(error: unknown): string {
  if (!(error instanceof S3ServiceException)) {
    return error instanceof Error ? error.message : String(error);
  }

  const message = error.message ?? '';
  if (message.includes('AWSCompromisedKeyQuarantineV3') || message.includes('explicit deny')) {
    return (
      'AWS access key is quarantined (likely exposed). Deactivate this key in IAM, ' +
      'create a new IAM user with s3:GetObject and s3:PutObject on the bucket, ' +
      'then update AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env.'
    );
  }

  if (error.name === 'AccessDenied') {
    return 'IAM user lacks permission. Required: s3:GetObject, s3:PutObject, s3:HeadBucket on the bucket.';
  }

  return message || error.name;
}

/** Verify bucket access; probes GetObject when HeadBucket returns a generic error. */
export async function verifyS3Access(): Promise<void> {
  if (!isS3Configured) {
    throw new Error('S3 is not configured');
  }

  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (headError) {
    if (
      headError instanceof S3ServiceException &&
      headError.message &&
      headError.message !== 'UnknownError'
    ) {
      throw headError;
    }
  }

  try {
    await getS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: '__access_check__',
      }),
    );
  } catch (probeError) {
    if (probeError instanceof S3ServiceException && probeError.name === 'NoSuchKey') {
      return;
    }
    throw probeError;
  }
}

/** Resolve a stored DB reference to an S3 object key, if applicable. */
export function resolveS3Key(stored: string): string | null {
  if (!stored || !isS3Configured) {
    return null;
  }
  if (stored.startsWith('http://') || stored.startsWith('https://')) {
    return extractS3KeyFromUrl(stored);
  }
  return stored.replace(/^\//, '');
}
