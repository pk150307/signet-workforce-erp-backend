import { ConflictError, NotFoundError } from '../../common/errors';
import { clientRepository } from '../client/client.repository';
import { siteRepository } from '../site/site.repository';
import { query } from '../../database/pool';
import { billingConfigurationRepository } from './billing-configuration.repository';
import {
  BillingConfigurationFilter,
  CreateBillingConfigurationInput,
  UpdateBillingConfigurationInput,
} from './billing-configuration.types';
import { BILLING_CYCLE, BILLING_TYPE, GST_TYPE } from './billing.constants';

export class BillingConfigurationService {
  list(filter: BillingConfigurationFilter) {
    return billingConfigurationRepository.findAll(filter);
  }

  listComponents() {
    return billingConfigurationRepository.listMasterComponents();
  }

  async getById(id: string) {
    const config = await billingConfigurationRepository.findById(id);
    if (!config) throw new NotFoundError('Billing configuration', id);
    return config;
  }

  async getBySiteId(siteId: string) {
    const config = await billingConfigurationRepository.findBySiteId(siteId);
    if (!config) throw new NotFoundError('Billing configuration for site', siteId);
    return config;
  }

  private async assertClientAndSite(clientId: string, siteId: string): Promise<void> {
    const clientExists = await clientRepository.exists(clientId);
    if (!clientExists) throw new NotFoundError('Client', clientId);

    const siteClientId = await siteRepository.getClientIdForSite(siteId);
    if (!siteClientId) throw new NotFoundError('Site', siteId);
    if (siteClientId !== clientId) {
      throw new ConflictError('Site does not belong to the specified client.');
    }
  }

  private async assertContract(clientId: string, contractId: string | null | undefined): Promise<void> {
    if (!contractId) return;

    const { rows } = await query<{ client_id: string }>(
      `SELECT client_id FROM contracts WHERE id = $1 AND NOT is_deleted`,
      [contractId],
    );
    if (!rows[0]) throw new NotFoundError('Contract', contractId);
    if (String(rows[0].client_id) !== clientId) {
      throw new ConflictError('Contract does not belong to the specified client.');
    }
  }

  private normalizeBillingType(value?: string): string {
    const allowed = Object.values(BILLING_TYPE);
    return value && allowed.includes(value as (typeof allowed)[number]) ? value : BILLING_TYPE.MONTHLY;
  }

  private normalizeBillingCycle(value?: string): string {
    const allowed = Object.values(BILLING_CYCLE);
    return value && allowed.includes(value as (typeof allowed)[number]) ? value : BILLING_CYCLE.MONTHLY;
  }

  private normalizeGstType(value?: string): string {
    const allowed = Object.values(GST_TYPE);
    return value && allowed.includes(value as (typeof allowed)[number]) ? value : GST_TYPE.CGST_SGST;
  }

  async create(input: CreateBillingConfigurationInput) {
    await this.assertClientAndSite(input.clientId, input.siteId);
    await this.assertContract(input.clientId, input.contractId);

    const exists = await billingConfigurationRepository.existsForSite(input.siteId);
    if (exists) {
      throw new ConflictError('A billing configuration already exists for this site.');
    }

    const billingType = this.normalizeBillingType(input.billingType);
    const billingCycle = this.normalizeBillingCycle(input.billingCycle);
    const gstType = this.normalizeGstType(input.gstType);

    const created = await billingConfigurationRepository.create({
      ...input,
      billingType,
      billingCycle,
      gstType,
    });

    await billingConfigurationRepository.syncSiteBillingFields(
      input.siteId,
      billingType,
      input.billingRate,
      input.requiredHeadcount,
      input.createdBy,
    );

    return created;
  }

  async update(input: UpdateBillingConfigurationInput) {
    const existing = await billingConfigurationRepository.findById(input.id);
    if (!existing) throw new NotFoundError('Billing configuration', input.id);

    await this.assertClientAndSite(input.clientId, input.siteId);
    await this.assertContract(input.clientId, input.contractId);

    if (input.siteId !== existing.siteId) {
      const siteTaken = await billingConfigurationRepository.existsForSite(input.siteId, input.id);
      if (siteTaken) {
        throw new ConflictError('A billing configuration already exists for this site.');
      }
    }

    const billingType = this.normalizeBillingType(input.billingType);
    const billingCycle = this.normalizeBillingCycle(input.billingCycle);
    const gstType = this.normalizeGstType(input.gstType);

    await billingConfigurationRepository.update({
      ...input,
      billingType,
      billingCycle,
      gstType,
    });

    await billingConfigurationRepository.syncSiteBillingFields(
      input.siteId,
      billingType,
      input.billingRate,
      input.requiredHeadcount,
      input.updatedBy,
    );

    return billingConfigurationRepository.findById(input.id);
  }

  async delete(id: string, deletedBy: string): Promise<void> {
    const deleted = await billingConfigurationRepository.softDelete(id, deletedBy);
    if (!deleted) throw new NotFoundError('Billing configuration', id);
  }
}

export const billingConfigurationService = new BillingConfigurationService();
