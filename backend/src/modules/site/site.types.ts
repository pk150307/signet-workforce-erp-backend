export interface SiteListItem {
  id: string;
  siteCode: string;
  siteName: string;
  clientId: string;
  clientCompanyName: string;
  city: string;
  state: string;
  requiredHeadcount: number;
  deployedHeadcount: number;
  isActive: boolean;
}

export interface SiteDetail extends SiteListItem {
  description: string | null;
  address: string;
  pinCode: string;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  billingRatePerDay: number | null;
  billingRatePerMonth: number | null;
}

export interface SiteSummary {
  totalSites: number;
  activeSites: number;
  totalHeadcountRequired: number;
  totalDeployed: number;
  understaffedSites: number;
}

export interface CreateSiteInput {
  clientId: string;
  siteName: string;
  description?: string | null;
  address: string;
  city: string;
  state: string;
  pinCode?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  requiredHeadcount?: number;
  billingRatePerDay?: number | null;
  billingRatePerMonth?: number | null;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateSiteInput extends CreateSiteInput {
  id: string;
}

export interface SiteFilter {
  page: number;
  pageSize: number;
  search?: string;
  clientId?: string;
  isActive?: boolean;
}
