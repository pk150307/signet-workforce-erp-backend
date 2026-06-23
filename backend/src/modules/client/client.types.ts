export interface ClientListItem {
  id: string;
  clientCode: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  isActive: boolean;
  totalSites: number;
}

export interface ClientDetail extends ClientListItem {
  alternatePhone: string | null;
  website: string | null;
  address: string;
  pinCode: string;
  gstNumber: string | null;
  panNumber: string | null;
  notes: string | null;
}

export interface CreateClientInput {
  companyName: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  alternatePhone?: string | null;
  website?: string | null;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  notes?: string | null;
  isActive?: boolean;
  createdBy: string;
}

export interface UpdateClientInput extends CreateClientInput {
  id: string;
}

export interface ClientFilter {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
}
