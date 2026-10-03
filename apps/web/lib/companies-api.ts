import { apiCall, type Paginated } from './api-client';

export interface CompanyAddress {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  deliveryNotes: string | null;
  active: boolean;
}

export interface CompanyDomain {
  id: string;
  domain: string;
}

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  active: boolean;
  priceTier: { id: string; code: string; name: string };
  owner: { id: string; fullName: string; email: string } | null;
  billingContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  deliveryDefaults: {
    defaultAddressId: string | null;
    defaultDeliveryTime: string | null;
    packagingType: { id: string; name: string } | null;
    leaveKitchenMinutes: number;
    driverInstructions: string | null;
    defaultDriver: { id: string; fullName: string } | null;
  };
  domains: CompanyDomain[];
  addresses: CompanyAddress[];
  workingDays: string[];
  employeeCount: number;
}

export interface CompanyCalendar {
  workingDays: string[];
  holidays: { id: string; date: string; name: string | null }[];
}

export interface MenuVisibility {
  hiddenCategories: { id: string; slug: string; name: string }[];
  hiddenDishes: { id: string; sku: string; name: string }[];
}

export interface Employee {
  id: string;
  company: { id: string; name: string };
  email: string;
  fullName: string;
  phone: string | null;
  defaultAddress: { id: string; label: string } | null;
  deliveryPermissions: {
    canChooseAddress: boolean;
    canChooseDeliveryTime: boolean;
    canChoosePackaging: boolean;
  };
  allergens: { id: string; name: string }[];
  dietaryTags: { id: string; name: string }[];
  allergyNotes: string | null;
  dietaryNotes: string | null;
  ownsCompany: boolean;
  active: boolean;
}

export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export function fetchCompanies(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<Paginated<Company>> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });

  if (params.search) {
    query.set('search', params.search);
  }

  return apiCall<Paginated<Company>>(`/companies?${query}`);
}

export function fetchCompany(id: string): Promise<Company> {
  return apiCall<Company>(`/companies/${id}`);
}

export function createCompany(body: unknown): Promise<Company> {
  return apiCall<Company>('/companies', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCompany(id: string, body: unknown): Promise<Company> {
  return apiCall<Company>(`/companies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function addCompanyDomain(
  id: string,
  domain: string,
): Promise<CompanyDomain> {
  return apiCall<CompanyDomain>(`/companies/${id}/domains`, {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

export function removeCompanyDomain(
  id: string,
  domainId: string,
): Promise<void> {
  return apiCall<void>(`/companies/${id}/domains/${domainId}`, {
    method: 'DELETE',
  });
}

export function addCompanyAddress(
  id: string,
  body: unknown,
): Promise<CompanyAddress> {
  return apiCall<CompanyAddress>(`/companies/${id}/addresses`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function retireCompanyAddress(
  id: string,
  addressId: string,
): Promise<void> {
  return apiCall<void>(`/companies/${id}/addresses/${addressId}`, {
    method: 'DELETE',
  });
}

export function fetchCompanyCalendar(id: string): Promise<CompanyCalendar> {
  return apiCall<CompanyCalendar>(`/companies/${id}/calendar`);
}

export function replaceCompanyCalendar(
  id: string,
  workingDays: string[],
): Promise<CompanyCalendar> {
  return apiCall<CompanyCalendar>(`/companies/${id}/calendar`, {
    method: 'PUT',
    body: JSON.stringify({ workingDays }),
  });
}

export function addCompanyHoliday(
  id: string,
  body: { date: string; name?: string },
): Promise<unknown> {
  return apiCall(`/companies/${id}/holidays`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function removeCompanyHoliday(
  id: string,
  holidayId: string,
): Promise<void> {
  return apiCall<void>(`/companies/${id}/holidays/${holidayId}`, {
    method: 'DELETE',
  });
}

export function updateDeliveryDefaults(
  id: string,
  body: unknown,
): Promise<Company> {
  return apiCall<Company>(`/companies/${id}/delivery-defaults`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function updateCompanyPriceTier(
  id: string,
  priceTierId: string,
): Promise<Company> {
  return apiCall<Company>(`/companies/${id}/price-tier`, {
    method: 'PATCH',
    body: JSON.stringify({ priceTierId }),
  });
}

export function fetchMenuVisibility(id: string): Promise<MenuVisibility> {
  return apiCall<MenuVisibility>(`/companies/${id}/menu-visibility`);
}

export function replaceMenuVisibility(
  id: string,
  body: { hiddenCategoryIds: string[]; hiddenDishIds: string[] },
): Promise<MenuVisibility> {
  return apiCall<MenuVisibility>(`/companies/${id}/menu-visibility`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function fetchEligibleDrivers(): Promise<
  { id: string; staffCode: string; fullName: string }[]
> {
  return apiCall('/companies/eligible-drivers');
}

export function fetchEmployee(id: string): Promise<Employee> {
  return apiCall<Employee>(`/employees/${id}`);
}

export function fetchReferenceItems(
  kind:
    | 'allergens'
    | 'dietary-tags'
    | 'packaging-types'
    | 'kitchen-stations',
): Promise<{ id: string; code: string; name: string }[]> {
  return apiCall(`/reference/${kind}`);
}

export function fetchEmployees(params: {
  page: number;
  limit: number;
  companyId?: string;
  search?: string;
}): Promise<Paginated<Employee>> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });

  if (params.companyId) {
    query.set('companyId', params.companyId);
  }

  if (params.search) {
    query.set('search', params.search);
  }

  return apiCall<Paginated<Employee>>(`/employees?${query}`);
}

export function createEmployee(body: unknown): Promise<Employee> {
  return apiCall<Employee>('/employees', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateEmployee(id: string, body: unknown): Promise<Employee> {
  return apiCall<Employee>(`/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
