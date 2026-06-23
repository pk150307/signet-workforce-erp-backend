import { S3Client } from '@aws-sdk/client-s3';
import { config } from './index';

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
