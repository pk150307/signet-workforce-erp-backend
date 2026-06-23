import type { Response } from 'express';
import { DocumentDownloadInfo } from '../employee/employee.types';
import { readStoredFile } from './storage.service';

export interface DocumentDownloadOptions {
  inline?: boolean;
}

function contentDisposition(fileName: string, inline: boolean): string {
  const safeName = fileName.replace(/[^\w.\-() ]+/g, '_');
  const disposition = inline ? 'inline' : 'attachment';
  return `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function sendDocumentDownload(
  res: Response,
  file: DocumentDownloadInfo,
  options: DocumentDownloadOptions = {},
): Promise<void> {
  const inline = options.inline ?? false;
  const content = await readStoredFile(file.stored);

  if (!content) {
    res.status(404).json({ status: 404, title: 'Document file not found.' });
    return;
  }

  res.setHeader('Content-Type', file.mimeType || content.contentType);
  res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
  res.send(content.data);
}
