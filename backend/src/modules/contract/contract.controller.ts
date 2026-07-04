import { Request, Response } from 'express';
import { contractService } from './contract.service';
import { CreateContractInput, UpdateContractInput, UpdateContractStatusInput } from './contract.types';
import { sendCreated, sendSuccess } from '../../common/response';
import { paramId } from '../../utils/request';
import { documentsService } from '../documents/documents.service';
import { DocumentType } from '../documents/documents.types';
import { contractRepository } from './contract.repository';
import { query } from '../../database/pool';
import { parsePageSize } from '../../types';

export class ContractController {
  async list(req: Request, res: Response): Promise<void> {
    const result = await contractService.list({
      pageSize: parsePageSize(req.query.pageSize),
      cursor: req.query.cursor as string | undefined,
      direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
      clientId: req.query.clientId as string | undefined,
      siteId: req.query.siteId as string | undefined,
      status: req.query.status as string | undefined,
      activeOnly: req.query.activeOnly === 'true',
      search: req.query.search as string | undefined,
    });
    sendSuccess(res, result);
  }

  async getSummary(req: Request, res: Response): Promise<void> {
    const result = await contractService.getSummary(req.query.clientId as string | undefined);
    sendSuccess(res, result);
  }

  async getById(req: Request, res: Response): Promise<void> {
    const result = await contractService.getById(paramId(req));
    sendSuccess(res, result);
  }

  async suggestDefaults(req: Request, res: Response): Promise<void> {
    const clientId = String(req.query.clientId);
    const siteId = req.query.siteId ? String(req.query.siteId) : null;
    const result = await contractService.suggestDefaults(clientId, siteId);
    sendSuccess(res, result);
  }

  async listByClient(req: Request, res: Response): Promise<void> {
    const result = await contractService.list({
      pageSize: parsePageSize(req.query.pageSize),
      cursor: req.query.cursor as string | undefined,
      direction: (req.query.direction as 'next' | 'prev' | undefined) ?? 'next',
      clientId: paramId(req, 'clientId'),
      siteId: req.query.siteId as string | undefined,
      status: req.query.status as string | undefined,
      activeOnly: req.query.activeOnly === 'true',
      search: req.query.search as string | undefined,
    });
    sendSuccess(res, result);
  }

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<CreateContractInput, 'createdBy'>;
    const result = await contractService.create({
      ...body,
      createdBy: req.user?.username ?? 'System',
    });
    sendCreated(res, result);
  }

  async update(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateContractInput, 'id' | 'updatedBy'>;
    const result = await contractService.update({
      ...body,
      id: paramId(req),
      updatedBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    const body = req.body as Omit<UpdateContractStatusInput, 'id' | 'updatedBy'>;
    const result = await contractService.updateStatus({
      ...body,
      id: paramId(req),
      updatedBy: req.user?.username ?? 'System',
    });
    sendSuccess(res, result!);
  }

  async delete(req: Request, res: Response): Promise<void> {
    await contractService.delete(paramId(req), req.user?.username ?? 'System');
    sendSuccess(res, { deleted: true });
  }

  async listDocuments(req: Request, res: Response): Promise<void> {
    const result = await contractService.listDocuments(paramId(req));
    sendSuccess(res, result);
  }

  async uploadDocument(req: Request, res: Response): Promise<void> {
    const contractId = paramId(req);
    await contractService.getById(contractId);

    if (!req.file) {
      res.status(400).json({ message: 'Contract document file is required.' });
      return;
    }

    const upload = await documentsService.upload({
      file: req.file,
      entityType: 'contract',
      entityId: contractId,
      documentType: DocumentType.Contract,
      createdBy: req.user?.username ?? 'System',
    });

    await query(
      `UPDATE contracts
       SET contract_document_url = $2, updated_at = NOW(), updated_by = $3
       WHERE id = $1 AND NOT is_deleted`,
      [contractId, upload.downloadUrl, req.user?.username ?? 'System'],
    );

    const documents = await contractRepository.findDocuments(contractId);
    sendCreated(res, { upload, documents });
  }
}

export const contractController = new ContractController();
