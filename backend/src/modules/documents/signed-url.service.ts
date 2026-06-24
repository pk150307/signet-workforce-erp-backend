import { AppError } from '../../common/errors';
import { getPresignedObjectUrl, isS3Configured, resolveS3Key } from '../../config/s3';
import { getPublicUrl, isRemoteFilePath, resolveFileUrl } from './upload.config';
import { getActiveStorageBackend, normalizeStorageKey, resolveDiskPath } from './storage.service';

export const SIGNED_DOWNLOAD_EXPIRY_SECONDS = 300;
export const SIGNED_PREVIEW_EXPIRY_SECONDS = 3600;

export interface SignedDownloadResult {
  url: string;
  fileName?: string;
  expiresInSeconds: number;
  source: 's3' | 'disk';
}

export interface SignedDownloadOptions {
  expiresInSeconds?: number;
  fileName?: string;
  inline?: boolean;
}

/**
 * Generate a client-facing download URL for a stored file reference.
 * S3 → pre-signed URL. Local disk → public /uploads URL.
 * Returns null when the file must be streamed through the API (legacy disk path).
 */
export async function createSignedDownloadUrl(
  storedPath: string,
  options: SignedDownloadOptions = {},
): Promise<SignedDownloadResult | null> {
  if (!storedPath) {
    return null;
  }

  const expiresInSeconds = options.expiresInSeconds ?? SIGNED_DOWNLOAD_EXPIRY_SECONDS;
  const key = normalizeStorageKey(storedPath);

  if (getActiveStorageBackend() === 's3' && isS3Configured) {
    const s3Key =
      resolveS3Key(storedPath) ?? (!isRemoteFilePath(storedPath) ? key : null);

    if (s3Key) {
      const url = await getPresignedObjectUrl(s3Key, expiresInSeconds, {
        inline: options.inline,
        fileName: options.fileName,
      });

      if (!url) {
        throw new AppError(
          503,
          'Could not generate a secure download link. Verify S3 credentials and permissions.',
        );
      }

      return {
        url,
        fileName: options.fileName,
        expiresInSeconds,
        source: 's3',
      };
    }
  }

  const publicUrl = resolveFileUrl(storedPath) || getPublicUrl(key);
  if (publicUrl && !publicUrl.includes('.amazonaws.com') && resolveDiskPath(storedPath)) {
    return {
      url: publicUrl,
      fileName: options.fileName,
      expiresInSeconds: 0,
      source: 'disk',
    };
  }

  return null;
}
