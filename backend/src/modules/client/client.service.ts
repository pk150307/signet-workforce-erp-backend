import { clientRepository } from './client.repository';
import { ClientFilter, CreateClientInput, UpdateClientInput } from './client.types';
import { NotFoundError } from '../../common/errors';
import { siteRepository } from '../site/site.repository';

export class ClientService {
  list(filter: ClientFilter) {
    return clientRepository.findAll(filter);
  }

  async getById(id: string) {
    const client = await clientRepository.findById(id);
    if (!client) throw new NotFoundError('Client', id);
    return client;
  }

  create(input: CreateClientInput) {
    return clientRepository.create(input);
  }

  async update(input: UpdateClientInput) {
    const exists = await clientRepository.findById(input.id);
    if (!exists) throw new NotFoundError('Client', input.id);
    await clientRepository.update(input);
    return clientRepository.findById(input.id);
  }

  async delete(id: string, deletedBy: string) {
    const deleted = await clientRepository.softDelete(id, deletedBy);
    if (!deleted) throw new NotFoundError('Client', id);
  }

  listSites(clientId: string, page: number, pageSize: number) {
    return siteRepository.findAll({ page, pageSize, clientId });
  }
}

export const clientService = new ClientService();
