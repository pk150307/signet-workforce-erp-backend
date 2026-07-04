export interface PenaltyRule {
  type: string;
  description?: string;
  ratePct?: number;
  fixedAmount?: number;
  graceDays?: number;
}

export interface ContractDocumentDto {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  downloadUrl: string;
  createdAt: string;
  createdBy: string;
}

export interface ContractListItem {
  id: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  siteId: string | null;
  siteName: string | null;
  siteCode: string | null;
  contractCode: string;
  contractName: string;
  startDate: string;
  endDate: string | null;
  billingType: string;
  billingRate: number | null;
  pfPct: number | null;
  esicPct: number | null;
  lwfPct: number | null;
  serviceChargePct: number;
  gstPct: number;
  invoiceFrequency: string;
  invoicePrefix: string | null;
  status: string;
  isActivePeriod: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface ContractDetail extends ContractListItem {
  pfPct: number | null;
  esicPct: number | null;
  lwfPct: number | null;
  penaltyRules: PenaltyRule[];
  invoiceTerms: string | null;
  contractDocumentUrl: string | null;
  notes: string | null;
  documents: ContractDocumentDto[];
  linkedBillingConfigurationId: string | null;
}

export interface ContractFilter {
  pageSize: number;
  cursor?: string | null;
  direction?: 'next' | 'prev';
  page?: number;
  clientId?: string;
  siteId?: string;
  status?: string;
  search?: string;
  activeOnly?: boolean;
}

export interface CreateContractInput {
  clientId: string;
  siteId?: string | null;
  contractName: string;
  contractCode?: string;
  startDate: string;
  endDate?: string | null;
  billingType?: string;
  billingRate?: number | null;
  pfPct?: number | null;
  esicPct?: number | null;
  serviceChargePct?: number;
  lwfPct?: number | null;
  gstPct?: number;
  penaltyRules?: PenaltyRule[];
  invoiceFrequency?: string;
  invoicePrefix?: string | null;
  invoiceTerms?: string | null;
  contractDocumentUrl?: string | null;
  status?: string;
  notes?: string | null;
  syncBillingConfiguration?: boolean;
  createdBy: string;
}

export interface UpdateContractInput extends Omit<CreateContractInput, 'createdBy'> {
  id: string;
  updatedBy: string;
}

export interface UpdateContractStatusInput {
  id: string;
  status: string;
  note?: string;
  syncBillingConfiguration?: boolean;
  updatedBy: string;
}

export interface ContractSummary {
  total: number;
  draft: number;
  active: number;
  expired: number;
  terminated: number;
  cancelled: number;
  expiringWithin30Days: number;
}
