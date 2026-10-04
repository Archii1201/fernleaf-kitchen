import { get, send } from './client';

export interface Profile {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export const login = (email: string, password: string) =>
  send<Omit<Profile, 'permissions'>>('POST', '/auth/login', { email, password });
export const logout = () => send<void>('POST', '/auth/logout');
export const me = () => get<Profile>('/auth/me');
