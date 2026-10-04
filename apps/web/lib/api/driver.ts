import { get, send } from './client';

export interface DriverDrop {
  id: string;
  status: string;
  deliveryTime: string;
  company: { id: string; name: string };
  address: { id: string; label: string; line1: string; city: string } | null;
  notes: string | null;
  orders: { id: string; orderNumber: string; status: string }[];
}

export const driverDropsToday = () => get<{ date: string; drops: DriverDrop[] }>('/driver/drops/today');

export function driverDeliver(id: string, note?: string, file?: File) {
  const body = new FormData();
  if (note) {
    body.set('note', note);
  }
  if (file) {
    body.set('file', file);
  }
  return send('POST', `/driver/drops/${id}/deliver`, body);
}
