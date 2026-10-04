import { get, send } from './client';

export interface Drop {
  id: string;
  status: 'PENDING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | string;
  deliveryDate: string;
  deliveryTime: string;
  company: { id: string; name: string };
  address: { id: string; label: string; line1: string; city: string } | null;
  driver: { id: string; staffCode: string; fullName: string } | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  onTime: boolean | null;
  notes: string | null;
  deliveryPhotoFileId: string | null;
  orders: { id: string; orderNumber: string; status: string }[];
}

export const listDrops = (date: string) => get<{ date: string; drops: Drop[] }>('/dispatch/drops', { date });
export const assignDriver = (id: string, driverStaffId: string) =>
  send<Drop>('POST', `/dispatch/drops/${id}/assign-driver`, { driverStaffId });
export const markDispatchReady = (orderId: string) => send('POST', `/dispatch/orders/${orderId}/ready`);
export const markOut = (id: string) => send<Drop>('POST', `/dispatch/drops/${id}/out`);
export const markDelivered = (id: string) => send<Drop>('POST', `/dispatch/drops/${id}/deliver`);
