import { get, send, type Paginated } from './client';

export interface Staff {
  id: string;
  email: string;
  active: boolean;
  role: { id: string; name: string };
  profile: { staffCode: string; fullName: string; phone: string | null; jobTitle: string | null } | null;
  createdAt: string;
}

export const listStaff = (page: number) => get<Paginated<Staff>>('/staff', { page, limit: 100 });
export const createStaff = (body: unknown) => send<Staff>('POST', '/staff', body);
export const updateStaff = (id: string, body: unknown) => send<Staff>('PATCH', `/staff/${id}`, body);
export const setStaffActive = (id: string, active: boolean) =>
  send<Staff>('PATCH', `/staff/${id}/active`, { active });
export const setStaffRole = (id: string, roleId: string) => send<Staff>('PATCH', `/staff/${id}/role`, { roleId });
