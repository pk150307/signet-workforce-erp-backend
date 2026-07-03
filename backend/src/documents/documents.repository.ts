import { query } from '../../database/pool';
import type { StoredDocumentRow } from './documents.types';

export class DocumentsRepository {
  async createDocument(data: {
    entityType: string;
    entityId: string | null;
    documentType: number;
    fileName: string;
    filePath: string;
    mimeType: string;
    fileSize: number;
    createdBy: string;
  }): Promise<string> {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO documents (entity_type, entity_id, document_type, file_name, file_path, mime_type, file_size, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        data.entityType,
        data.entityId,
        data.documentType,
        data.fileName,
        data.filePath,
        data.mimeType,
        data.fileSize,
        data.createdBy,
      ],
    );
    return rows[0].id;
  }

  async getDocument(id: string): Promise<StoredDocumentRow | null> {
    const { rows } = await query<StoredDocumentRow>(
      `SELECT id, entity_type, entity_id, document_type, file_name, file_path,
              mime_type, file_size, created_at, created_by
       FROM documents
       WHERE id = $1 AND NOT is_deleted`,
      [id],
    );
    return rows[0] ?? null;
  }

  async updateEmployeePhoto(employeeId: string, photoKey: string, updatedBy: string): Promise<void> {
    await query(
      `UPDATE employees SET profile_photo_url = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND NOT is_deleted`,
      [employeeId, photoKey, updatedBy],
    );
  }

  async employeeExists(employeeId: string): Promise<boolean> {
    const { rows } = await query('SELECT 1 FROM employees WHERE id = $1 AND NOT is_deleted', [employeeId]);
    return rows.length > 0;
  }
}

export const documentsRepository = new DocumentsRepository();
