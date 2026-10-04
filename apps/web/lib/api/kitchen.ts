import { get, send } from './client';

export interface KitchenUnit {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'READY' | 'CANCELLED' | string;
  quantity: number;
  dish: { name: string; sku: string };
  station: { id: string | null; code: string; name: string };
  combination: { signature: string; options: { group: string; name: string }[] };
  startedAt: string | null;
  doneAt: string | null;
}

export interface KitchenOrder {
  id: string;
  orderNumber: string;
  status: string;
  company: { id: string; name: string };
  planned: { kitchenReadyAt: string; dispatchReadyAt: string };
  timing: string;
  units: KitchenUnit[];
}

export interface KitchenBoard {
  date: string;
  evaluatedAt: string;
  stations: { station: { id: string | null; code: string; name: string }; orders: KitchenOrder[] }[];
}

export interface CutoffProcessResult {
  date: string;
  cutoffAt: string;
  processed: boolean;
  skipped: boolean;
  alreadyProcessed: boolean;
  reason: string | null;
  cancelled: number;
  confirmed: number;
  drops: number;
}

export const kitchenBoard = (date: string) => get<KitchenBoard>('/kitchen/board', { date });
export const startUnit = (id: string) => send('POST', `/kitchen/units/${id}/start`);
export const doneUnit = (id: string) => send('POST', `/kitchen/units/${id}/done`);
export const forceComplete = (orderId: string) => send('POST', `/kitchen/orders/${orderId}/force-complete`);
export const processCutoff = (date: string) => send<CutoffProcessResult>('POST', `/cutoff/process/${date}`);
