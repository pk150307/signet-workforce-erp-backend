import fs from 'fs';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { config } from '../../config';
import { bucket, getS3Client, isS3Configured, resolveS3Key } from '../../config/s3';
import { DocumentDownloadInfo } from '../employee/employee.types';
import { uploadRoot } from './upload.config';

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

async function streamFromS3(res: Response, s3Key: string, file: DocumentDownloadInfo, inline: boolean): Promise<void> {
  if (!isS3Configured) {
    res.status(503).json({ status: 503, title: 'S3 storage is not configured.' });
    return;
  }

  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    }),
  );

  if (!response.Body) {
    res.status(404).json({ status: 404, title: 'Document file not found in storage.' });
    return;
  }

  res.setHeader('Content-Type', file.mimeType || response.ContentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));

  const bytes = await response.Body.transformToByteArray();
  res.send(Buffer.from(bytes));
}

export async function sendDocumentDownload(
  res: Response,
  file: DocumentDownloadInfo,
  options: DocumentDownloadOptions = {},
): Promise<void> {
  const inline = options.inline ?? false;

  if (file.source === 'disk' && file.diskPath) {
    if (!fs.existsSync(file.diskPath)) {
      res.status(404).json({ status: 404, title: 'Document file not found on server.' });
      return;
    }
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
    res.sendFile(path.resolve(file.diskPath));
    return;
  }

  if (file.source === 's3' && file.s3Key) {
    await streamFromS3(res, file.s3Key, file, inline);
    return;
  }

  if (file.source === 'url' && file.url) {
    const s3Key = resolveS3Key(file.url);
    if (s3Key) {
      await streamFromS3(res, s3Key, file, inline);
      return;
    }

    const diskPath = resolveDiskPathFromPublicUrl(file.url);
    if (diskPath) {
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
      res.sendFile(path.resolve(diskPath));
      return;
    }

    const remote = await fetch(file.url);
    if (!remote.ok) {
      res.status(404).json({ status: 404, title: 'Document file could not be retrieved.' });
      return;
    }

    res.setHeader('Content-Type', file.mimeType || remote.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
    res.send(Buffer.from(await remote.arrayBuffer()));
  }
}
