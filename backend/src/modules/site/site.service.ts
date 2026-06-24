import { siteRepository } from './site.repository';
import { CreateSiteInput, SiteFilter, UpdateSiteInput } from './site.types';
import { NotFoundError } from '../../common/errors';
import { clientRepository } from '../client/client.repository';
import { deleteApprovalService } from '../delete-requests/delete-requests.service';
import { DeleteActionContext, DeleteActionResult } from '../delete-requests/delete-requests.types';
import { IAM_MODULES } from '../iam/iam.constants';

export class SiteService {
  list(filter: SiteFilter) {
    return siteRepository.findAll(filter);
  }

  getSummary() {
    return siteRepository.getSummary();
  }

  async getById(id: string) {
    const site = await siteRepository.findById(id);
    if (!site) throw new NotFoundError('Site', id);
    return site;
  }

  async create(input: CreateSiteInput) {
    const clientExists = await clientRepository.exists(input.clientId);
    if (!clientExists) throw new NotFoundError('Client', input.clientId);
    return siteRepository.create(input);
  }

  async update(input: UpdateSiteInput) {
    const existing = await siteRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Site', input.id);

    const clientExists = await clientRepository.exists(input.clientId);
    if (!clientExists) throw new NotFoundError('Client', input.clientId);

    await siteRepository.update(input);
    return siteRepository.findById(input.id);
  }

  async delete(id: string, context: DeleteActionContext): Promise<DeleteActionResult> {
    const site = await siteRepository.findById(id);
    if (!site) throw new NotFoundError('Site', id);

    return deleteApprovalService.handleDelete({
      module: IAM_MODULES.SITES,
      entityType: IAM_MODULES.SITES,
      entityId: id,
      entityLabel: site.siteName,
      entitySnapshot: {
        id: site.id,
        siteCode: site.siteCode,
        siteName: site.siteName,
        clientId: site.clientId,
      },
      context,
    });
  }
}

export const siteService = new SiteService();
