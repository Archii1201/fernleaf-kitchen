import { get } from './client';

interface Envelope {
  date: string;
  timeZone: string;
}

export interface AdminDashboard extends Envelope {
  evaluatedAt: string;
  metrics: {
    ordersToday: number;
    mealsToday: number;
    kitchenProgress: { totalUnits: number; completedUnits: number; percentComplete: number };
    nextCutoff: { deliveryDate: string; cutoffAt: string; cutoffDate: string } | null;
    pendingCutoff: { date: string; cutoffAt: string }[];
    uninvoicedBalanceCents: number;
    uninvoicedOrderCount: number;
    outstandingInvoices: { count: number; totalCents: number };
  };
  groups: { next7Days: { date: string; orders: number; meals: number }[] };
  lists: { setupGaps: { code: string; message: string }[] };
}

export interface StationCount {
  station: string;
  count: number;
}

export interface KitchenDashboard extends Envelope {
  evaluatedAt: string;
  metrics: {
    unitsToday: number;
    late: number;
    atRisk: number;
    atRiskWindowMinutes: number;
    nextDeadline: { at: string; orderNumber: string; station: string } | null;
  };
  groups: {
    unitsByStation: StationCount[];
    tomorrow: { date: string; units: number; byStation: StationCount[] };
  };
  lists: {
    prep: {
      id: string;
      status: string;
      station: string;
      dish: string;
      orderNumber: string;
      timing: string;
      kitchenReadyAt: string | null;
    }[];
  };
}

export interface DispatchDropCard {
  id: string;
  status: string;
  time: string;
  company: string;
  driver: string | null;
  dispatchReadyAt: string | null;
}

export interface DispatchDashboard extends Envelope {
  evaluatedAt: string;
  metrics: {
    dropsToday: number;
    needsDriver: number;
    leavingSoon: number;
    late: number;
    onTimeRatePercent: number | null;
    deliveredToday: number;
  };
  groups: { byStatus: Record<string, number>; driverLoad: { driver: string; count: number }[] };
  lists: { needsDriver: DispatchDropCard[]; leavingSoon: DispatchDropCard[]; late: DispatchDropCard[] };
}

export interface DriverDashboard extends Envelope {
  metrics: {
    assigned: number;
    delivered: number;
    remaining: number;
    percentDelivered: number;
    onTimeCount: number;
  };
  lists: {
    nextDrop: {
      id: string;
      time: string;
      status: string;
      company: string;
      address: { label: string; line1: string; city: string };
    } | null;
  };
}

export const adminDashboard = () => get<AdminDashboard>('/dashboard/admin');
export const kitchenDashboard = () => get<KitchenDashboard>('/dashboard/kitchen');
export const dispatchDashboard = () => get<DispatchDashboard>('/dashboard/dispatch');
export const driverDashboard = () => get<DriverDashboard>('/dashboard/driver');
