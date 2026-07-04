import { BillingComponentCode } from './billing.constants';

export interface BillingComponentDto {
  id: string;
  code: BillingComponentCode | string;
  name: string;
  description: string | null;
  componentType: string;
  sortOrder: number;
  isSystem: boolean;
  isEnabledByDefault: boolean;
  isTaxable: boolean;
  hsnSacCode: string | null;
}

export interface BillingConfigurationComponentDto {
  id: string;
  billingComponentId: string;
  code: string;
  name: string;
  componentType: string;
  isEnabled: boolean;
  sortOrder: number;
  rateOverride: number | null;
  pctOverride: number | null;
  hsnSacCode: string | null;
  isTaxable: boolean;
}

export interface BillingConfigurationListItem {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  siteId: string;
  siteName: string;
  siteCode: string;
  billingType: string;
  billingCycle: string;
  billingRate: number | null;
  requiredHeadcount: number | null;
  gstPct: number;
  gstType: string;
  serviceChargePct: number;
  invoicePrefix: string | null;
  invoiceDueDays: number;
  sacCode: string;
  isActive: boolean;
  contractId: string | null;
  contractName: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface BillingConfigurationDetail extends BillingConfigurationListItem {
  pfPct: number | null;
  esicPct: number | null;
  lwfPct: number | null;
  invoiceNotes: string | null;
  natureOfService: string | null;
  components: BillingConfigurationComponentDto[];
}

export interface BillingConfigurationFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  page?: number;
  clientId?: string;
  siteId?: string;
  isActive?: boolean;
  search?: string;
}

export interface BillingConfigurationComponentInput {
  billingComponentId: string;
  isEnabled: boolean;
  sortOrder?: number;
  rateOverride?: number | null;
  pctOverride?: number | null;
}

export interface CreateBillingConfigurationInput {
  clientId: string;
  siteId: string;
  billingType?: string;
  requiredHeadcount?: number | null;
  billingRate?: number | null;
  serviceChargePct?: number;
  pfPct?: number | null;
  esicPct?: number | null;
  lwfPct?: number | null;
  gstPct?: number;
  gstType?: string;
  invoicePrefix?: string | null;
  billingCycle?: string;
  invoiceDueDays?: number;
  invoiceNotes?: string | null;
  sacCode?: string;
  natureOfService?: string | null;
  contractId?: string | null;
  isActive?: boolean;
  components?: BillingConfigurationComponentInput[];
  createdBy: string;
}

export interface UpdateBillingConfigurationInput extends Omit<CreateBillingConfigurationInput, 'createdBy'> {
  id: string;
  updatedBy: string;
}
