import fs from 'fs';
import path from 'path';
import { S3ServiceException } from '@aws-sdk/client-s3';
import type { Request, Response } from 'express';
import { config } from '../../config';
import { isS3Configured, resolveS3Key, describeS3AccessError } from '../../config/s3';
import { DocumentDownloadInfo } from '../employee/employee.types';
import { isRemoteFilePath, uploadRoot } from './upload.config';
import { readStoredFile } from './storage.service';
import { logger } from '../../utils/logger';
import { sendSuccess } from '../../common/response';
import { createSignedDownloadUrl } from './signed-url.service';

export interface DocumentDownloadOptions {
  inline?: boolean;
}

function contentDisposition(fileName: string, inline: boolean): string {
  const safeName = fileName.replace(/[^\w.\-() ]+/g, '_');
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function resolveDiskPathFromPublicUrl(url: string): string | null {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  if (!url.startsWith(base)) {
    return null;
  }
  const relative = url.slice(base.length).replace(/^\//, '');
  const diskPath = path.join(uploadRoot, relative);
  return fs.existsSync(diskPath) ? diskPath : null;
}

function storageAccessDetail(error: unknown): string | undefined {
  if (error instanceof S3ServiceException) {
    return describeS3AccessError(error);
  }
  return undefined;
}

export async function sendStoredFileDownload(
  res: Response,
  storedPath: string,
  file: Pick<DocumentDownloadInfo, 'fileName' | 'mimeType'>,
  options: DocumentDownloadOptions = {},
): Promise<void> {
  const inline = options.inline ?? false;

  try {
    const content = await readStoredFile(storedPath);
    if (content) {
      res.setHeader('Content-Type', file.mimeType || content.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
      res.send(content.data);
      return;
    }

    if (isRemoteFilePath(storedPath)) {
      const diskPath = resolveDiskPathFromPublicUrl(storedPath);
      if (diskPath) {
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
        res.sendFile(path.resolve(diskPath));
        return;
      }

      const s3Key = resolveS3Key(storedPath);
      if (!s3Key && !isS3Configured) {
        const remote = await fetch(storedPath);
        if (remote.ok) {
          res.setHeader(
            'Content-Type',
            file.mimeType || remote.headers.get('content-type') || 'application/octet-stream',
          );
          res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
          res.send(Buffer.from(await remote.arrayBuffer()));
          return;
        }
      }
    }

    res.status(404).json({
      status: 404,
      title: 'Document file not found.',
      detail: 'The file is not available in storage.',
    });
  } catch (error) {
    logger.error('Stored file download failed', {
      storedPath,
      error: error instanceof Error ? error.message : String(error),
    });

    if (res.headersSent) {
      return;
    }

    const accessDenied = error instanceof S3ServiceException && error.name === 'AccessDenied';
    res.status(accessDenied ? 503 : 500).json({
      status: accessDenied ? 503 : 500,
      title: accessDenied ? 'File storage access denied.' : 'Failed to download document.',
      detail: storageAccessDetail(error),
    });
  }
}

/** Return a signed S3 URL (JSON) or redirect; fall back to streaming for local disk files. */
export async function respondWithFileDownload(
  req: Request,
  res: Response,
  storedPath: string,
  file: { fileName: string; mimeType: string },
  options: DocumentDownloadOptions = {},
): Promise<void> {
  const inline = options.inline ?? false;
  const redirect = req.query.redirect === 'true' || req.query.redirect === '1';

  const signed = await createSignedDownloadUrl(storedPath, {
    fileName: file.fileName,
    inline,
  });

  if (signed?.url) {
    if (redirect) {
      res.redirect(signed.url);
      return;
    }

    sendSuccess(res, {
      url: signed.url,
      fileName: file.fileName,
      expiresInSeconds: signed.expiresInSeconds,
      source: signed.source,
    });
    return;
  }

  await sendStoredFileDownload(res, storedPath, file, { inline });
}
