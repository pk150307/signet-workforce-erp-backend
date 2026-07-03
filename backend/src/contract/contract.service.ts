import { AppError, ConflictError, NotFoundError } from '../../common/errors';
import { clientRepository } from '../client/client.repository';
import { siteRepository } from '../site/site.repository';
import { billingConfigurationRepository } from '../billing/billing-configuration.repository';
import { BILLING_CYCLE, BILLING_TYPE, CONTRACT_STATUS } from '../billing/billing.constants';
import { contractRepository } from './contract.repository';
import {
  ContractFilter,
  CreateContractInput,
  UpdateContractInput,
  UpdateContractStatusInput,
} from './contract.types';

const STATUS_TRANSITIONS: Record<string, string[]> = {
  [CONTRACT_STATUS.DRAFT]: [CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.CANCELLED],
  [CONTRACT_STATUS.ACTIVE]: [CONTRACT_STATUS.TERMINATED, CONTRACT_STATUS.CANCELLED, CONTRACT_STATUS.EXPIRED],
  [CONTRACT_STATUS.EXPIRED]: [],
  [CONTRACT_STATUS.TERMINATED]: [],
  [CONTRACT_STATUS.CANCELLED]: [],
};

export class ContractService {
  private async refreshExpired(): Promise<void> {
    await contractRepository.expireDueContracts();
  }

  async list(filter: ContractFilter) {
    await this.refreshExpired();
    return contractRepository.findAll(filter);
  }

  async getSummary(clientId?: string) {
    await this.refreshExpired();
    return contractRepository.getSummary(clientId);
  }

  async getById(id: string) {
    await this.refreshExpired();
    const contract = await contractRepository.findById(id);
    if (!contract) throw new NotFoundError('Contract', id);
    return contract;
  }

  async suggestDefaults(clientId: string, siteId?: string | null) {
    await this.assertClientAndSite(clientId, siteId ?? null);
    const client = await clientRepository.findById(clientId);
    if (!client) throw new NotFoundError('Client', clientId);

    let siteName: string | null = null;
    if (siteId) {
      const site = await siteRepository.findById(siteId);
      siteName = site?.siteName ?? null;
    }

    const contractCode = await contractRepository.nextContractCode(clientId);
    const contractName = siteName
      ? `${client.companyName} — ${siteName}`
      : `${client.companyName} — Master Contract`;
    const invoicePrefix = `${client.clientCode}/INV`;

    return { contractName, contractCode, invoicePrefix };
  }

  private async assertClientAndSite(clientId: string, siteId: string | null | undefined): Promise<void> {
    const clientExists = await clientRepository.exists(clientId);
    if (!clientExists) throw new NotFoundError('Client', clientId);

    if (!siteId) return;

    const siteClientId = await siteRepository.getClientIdForSite(siteId);
    if (!siteClientId) throw new NotFoundError('Site', siteId);
    if (siteClientId !== clientId) {
      throw new ConflictError('Site does not belong to the specified client.');
    }
  }

  private validateDates(startDate: string, endDate: string | null | undefined): void {
    if (endDate && endDate < startDate) {
      throw new AppError(400, 'Contract end date must be on or after the start date.');
    }
  }

  private normalizeBillingType(value?: string): string {
    const allowed = Object.values(BILLING_TYPE);
    return value && allowed.includes(value as (typeof allowed)[number]) ? value : BILLING_TYPE.MONTHLY;
  }

  private normalizeInvoiceFrequency(value?: string): string {
    const allowed = Object.values(BILLING_CYCLE);
    return value && allowed.includes(value as (typeof allowed)[number]) ? value : BILLING_CYCLE.MONTHLY;
  }

  private normalizeStatus(value?: string): string {
    const allowed = Object.values(CONTRACT_STATUS);
    return value && allowed.includes(value as (typeof allowed)[number]) ? value : CONTRACT_STATUS.DRAFT;
  }

  private async afterActivate(contractId: string, input: {
    clientId: string;
    siteId: string | null;
    syncBillingConfiguration?: boolean;
    updatedBy: string;
  }): Promise<void> {
    await contractRepository.terminateOverlappingActive(
      input.clientId,
      input.siteId,
      contractId,
      input.updatedBy,
    );

    if (input.syncBillingConfiguration !== false && input.siteId) {
      const linkedId = await contractRepository.syncBillingConfiguration(
        contractId,
        input.siteId,
        input.updatedBy,
      );
      if (linkedId) {
        const config = await billingConfigurationRepository.findById(linkedId);
        if (config) {
          await billingConfigurationRepository.syncSiteBillingFields(
            input.siteId,
            config.billingType,
            config.billingRate,
            config.requiredHeadcount,
            input.updatedBy,
          );
        }
      }
    }
  }

  async create(input: CreateContractInput) {
    await this.assertClientAndSite(input.clientId, input.siteId);
    this.validateDates(input.startDate, input.endDate);

    const billingType = this.normalizeBillingType(input.billingType);
    const invoiceFrequency = this.normalizeInvoiceFrequency(input.invoiceFrequency);
    const status = this.normalizeStatus(input.status);

    const contractCode = input.contractCode?.trim() || (await contractRepository.nextContractCode(input.clientId));

    const id = await contractRepository.create(
      {
        ...input,
        billingType,
        invoiceFrequency,
        status,
      },
      contractCode,
    );

    if (status === CONTRACT_STATUS.ACTIVE) {
      await this.afterActivate(id, {
        clientId: input.clientId,
        siteId: input.siteId ?? null,
        syncBillingConfiguration: input.syncBillingConfiguration,
        updatedBy: input.createdBy,
      });
    }

    return contractRepository.findById(id);
  }

  async update(input: UpdateContractInput) {
    const existing = await contractRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Contract', input.id);

    if (existing.status === CONTRACT_STATUS.CANCELLED || existing.status === CONTRACT_STATUS.TERMINATED) {
      throw new AppError(400, 'Terminated or cancelled contracts cannot be edited.');
    }

    await this.assertClientAndSite(input.clientId, input.siteId);
    this.validateDates(input.startDate, input.endDate);

    const billingType = this.normalizeBillingType(input.billingType);
    const invoiceFrequency = this.normalizeInvoiceFrequency(input.invoiceFrequency);
    const status = this.normalizeStatus(input.status);

    const wasActive = existing.status === CONTRACT_STATUS.ACTIVE;
    const willActivate = status === CONTRACT_STATUS.ACTIVE && !wasActive;

    await contractRepository.update({
      ...input,
      billingType,
      invoiceFrequency,
      status,
    });

    if (willActivate) {
      await this.afterActivate(input.id, {
        clientId: input.clientId,
        siteId: input.siteId ?? null,
        syncBillingConfiguration: input.syncBillingConfiguration,
        updatedBy: input.updatedBy,
      });
    } else if (status === CONTRACT_STATUS.ACTIVE && input.syncBillingConfiguration !== false && input.siteId) {
      await contractRepository.syncBillingConfiguration(input.id, input.siteId, input.updatedBy);
    }

    return contractRepository.findById(input.id);
  }

  async updateStatus(input: UpdateContractStatusInput) {
    const existing = await contractRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Contract', input.id);

    const nextStatus = this.normalizeStatus(input.status);
    const allowed = STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new AppError(
        400,
        `Cannot change contract status from '${existing.status}' to '${nextStatus}'.`,
      );
    }

    await contractRepository.updateStatus(input.id, nextStatus, input.updatedBy);

    if (nextStatus === CONTRACT_STATUS.ACTIVE) {
      await this.afterActivate(input.id, {
        clientId: existing.clientId,
        siteId: existing.siteId,
        syncBillingConfiguration: input.syncBillingConfiguration,
        updatedBy: input.updatedBy,
      });
    }

    return contractRepository.findById(input.id);
  }

  async delete(id: string, deletedBy: string): Promise<void> {
    const existing = await contractRepository.findById(id);
    if (!existing) throw new NotFoundError('Contract', id);

    if (existing.status === CONTRACT_STATUS.ACTIVE) {
      throw new AppError(400, 'Active contracts cannot be deleted. Terminate or cancel the contract first.');
    }

    const deleted = await contractRepository.softDelete(id, deletedBy);
    if (!deleted) throw new NotFoundError('Contract', id);
  }

  async listDocuments(contractId: string) {
    await this.getById(contractId);
    return contractRepository.findDocuments(contractId);
  }
}

export const contractService = new ContractService();
