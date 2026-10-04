import { get, send, type Paginated } from './client';

export interface KitchenSettings {
  cutoffTime: string;
  cutoffWorkingDays: number;
  workingDays: string[];
  timeZone: string;
  deliveryGraceMinutes: number;
  maxCutoffWorkingDays: number;
  updatedAt: string;
}

export interface Holiday {
  id: string;
  date: string;
  name: string | null;
}

export const getSettings = () => get<KitchenSettings>('/settings');
export const updateSettings = (body: {
  cutoffTime: string;
  cutoffWorkingDays: number;
  workingDays: string[];
  deliveryGraceMinutes?: number;
}) => send<KitchenSettings>('PUT', '/settings', body);
export interface CutoffPreview {
  deliveryDate: string;
  cutoffDate: string;
  cutoffAt: string;
  cutoffTime: string;
  cutoffWorkingDays: number;
  timeZone: string;
  evaluatedAt: string;
  hasPassed: boolean;
}

export const cutoffPreview = (deliveryDate: string) =>
  get<CutoffPreview>('/settings/cutoff-preview', { deliveryDate });
export const listHolidays = (page = 1) => get<Paginated<Holiday>>('/settings/holidays', { page, limit: 100 });
export const addHoliday = (body: { date: string; name?: string }) => send<Holiday>('POST', '/settings/holidays', body);
export const removeHoliday = (id: string) => send<void>('DELETE', `/settings/holidays/${id}`);
