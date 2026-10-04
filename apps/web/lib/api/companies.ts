import { get, send, type Paginated, type Query } from './client';

export const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

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

export interface Company {
  id: string;
  name: string;
  legalName: string | null;
  active: boolean;
  priceTier: { id: string; code: string; name: string } | null;
  owner: { id: string; fullName: string; email: string } | null;
  billingContact: { name: string | null; email: string | null; phone: string | null };
  deliveryDefaults: {
    defaultAddressId: string | null;
    defaultDeliveryTime: string | null;
    packagingType: { id: string; code: string; name: string } | null;
    leaveKitchenMinutes: number;
    driverInstructions: string | null;
    defaultDriver: { id: string; staffCode: string; fullName: string } | null;
  };
  domains: { id: string; domain: string }[];
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

export interface AddressInput {
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country?: string;
  deliveryNotes?: string;
}

export const listCompanies = (q: Query) => get<Paginated<Company>>('/companies', q);
export const getCompany = (id: string) => get<Company>(`/companies/${id}`);
export const createCompany = (body: unknown) => send<Company>('POST', '/companies', body);
export const updateCompany = (id: string, body: unknown) => send<Company>('PATCH', `/companies/${id}`, body);
export const addDomain = (id: string, domain: string) => send('POST', `/companies/${id}/domains`, { domain });
export const removeDomain = (id: string, domainId: string) =>
  send<void>('DELETE', `/companies/${id}/domains/${domainId}`);
export const addAddress = (id: string, body: AddressInput) => send('POST', `/companies/${id}/addresses`, body);
export const retireAddress = (id: string, addressId: string) =>
  send<void>('DELETE', `/companies/${id}/addresses/${addressId}`);
export const getCalendar = (id: string) => get<CompanyCalendar>(`/companies/${id}/calendar`);
export const replaceCalendar = (id: string, workingDays: string[]) =>
  send('PUT', `/companies/${id}/calendar`, { workingDays });
export const addCompanyHoliday = (id: string, body: { date: string; name?: string }) =>
  send('POST', `/companies/${id}/holidays`, body);
export const removeCompanyHoliday = (id: string, holidayId: string) =>
  send<void>('DELETE', `/companies/${id}/holidays/${holidayId}`);
export const updateDeliveryDefaults = (id: string, body: unknown) =>
  send<Company>('PATCH', `/companies/${id}/delivery-defaults`, body);
export const updateCompanyTier = (id: string, priceTierId: string | null) =>
  send<Company>('PATCH', `/companies/${id}/price-tier`, { priceTierId });
export const getMenuVisibility = (id: string) => get<MenuVisibility>(`/companies/${id}/menu-visibility`);
export const replaceMenuVisibility = (id: string, body: { hiddenCategoryIds: string[]; hiddenDishIds: string[] }) =>
  send<MenuVisibility>('PUT', `/companies/${id}/menu-visibility`, body);
export const eligibleDrivers = () =>
  get<{ id: string; staffCode: string; fullName: string }[]>('/companies/eligible-drivers');
