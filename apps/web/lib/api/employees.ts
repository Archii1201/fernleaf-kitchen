import { get, send, type Paginated, type Query } from './client';

export interface Employee {
  id: string;
  company: { id: string; name: string };
  email: string;
  fullName: string;
  phone: string | null;
  defaultAddress: { id: string; label: string; city?: string } | null;
  deliveryPermissions: {
    canChooseAddress: boolean;
    canChooseDeliveryTime: boolean;
    canChoosePackaging: boolean;
  };
  allergens: { id: string; code?: string; name: string }[];
  dietaryTags: { id: string; code?: string; name: string }[];
  allergyNotes: string | null;
  dietaryNotes: string | null;
  ownsCompany: boolean;
  active: boolean;
}

export const listEmployees = (q: Query) => get<Paginated<Employee>>('/employees', q);
export const getEmployee = (id: string) => get<Employee>(`/employees/${id}`);
export const createEmployee = (body: unknown) => send<Employee>('POST', '/employees', body);
export const updateEmployee = (id: string, body: unknown) => send<Employee>('PATCH', `/employees/${id}`, body);
