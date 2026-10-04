import { get, send, type Paginated, type Query } from './client';

export const ORDER_STATUSES = [
  'DRAFT',
  'PLACED',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
  'IN_KITCHEN',
  'READY',
  'DISPATCH_READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryDate: string;
  deliveryTime: string;
  subtotalCents: number;
  totalCents: number;
  version: number;
  invoiced: boolean;
  company: { id: string; name: string };
  employee: { id: string; fullName: string; email: string };
  createdAt: string;
}

export interface OrderCombination {
  id: string;
  quantity: number;
  signature: string;
  unitPriceCents: number;
  optionsPriceCents: number;
  totalCents: number;
  options: {
    optionId: string;
    optionGroupId: string;
    optionGroupName: string;
    optionName: string;
    optionPriceCents: number;
  }[];
  prepUnit: { id: string; status: string; quantity: number; dishName: string } | null;
}

export interface OrderLine {
  id: string;
  dishId: string;
  notes: string | null;
  sku: string;
  name: string;
  description: string | null;
  temperature: string;
  kitchenStation: { id: string | null; code: string; name: string };
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  combinations: OrderCombination[];
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  company: { id: string; name: string };
  employee: { id: string; fullName: string; email: string };
  delivery: {
    date: string;
    time: string;
    address: {
      id: string | null;
      label: string | null;
      line1: string | null;
      line2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    };
    packagingTypeName: string | null;
    leaveKitchenMinutes: number;
  };
  priceTier: { id: string; name: string };
  customerNotes: string | null;
  lines: OrderLine[];
  prepUnits: { id: string; dishName: string; quantity: number; status: string; kitchenStationCode: string }[];
  events: { id: string; type: string; occurredAt: string; note: string | null }[];
  invoice: { id: string; invoiceNumber: string; status: string } | null;
  subtotalCents: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderLineInput {
  dishId: string;
  categoryId?: string;
  quantity: number;
  combinations: { quantity: number; selections?: { optionGroupId: string; optionIds: string[] }[] }[];
  notes?: string;
}

export interface CreateOrderInput {
  customerEmployeeId: string;
  deliveryDate: string;
  deliveryTime?: string;
  deliveryAddressId?: string;
  packagingTypeId?: string;
  customerNotes?: string;
  lines: OrderLineInput[];
}

export interface OrderQuote {
  persisted: false;
  company: { id: string; name: string };
  employee: { id: string; fullName: string; email: string };
  delivery: {
    date: string;
    time: string;
    addressId: string | null;
    addressLabel: string | null;
    leaveKitchenMinutes: number;
    packagingTypeName: string | null;
  };
  priceTier: { id: string; name: string };
  cutoff: {
    deliveryDate: string;
    cutoffDate: string;
    cutoffAt: string;
    hasPassed: boolean;
    cutoffTime: string;
    cutoffWorkingDays: number;
  };
  lines: {
    dishId: string;
    sku: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    combinations: {
      quantity: number;
      signature: string;
      unitPriceCents: number;
      optionsPriceCents: number;
      totalCents: number;
      options: { optionGroupName?: string; optionName?: string; optionPriceCents?: number }[];
    }[];
  }[];
  subtotalCents: number;
  totalCents: number;
}

export const listOrders = (q: Query) => get<Paginated<OrderListItem>>('/orders', q);
export const getOrder = (id: string) => get<OrderDetail>(`/orders/${id}`);
export const quoteOrder = (body: CreateOrderInput) => send<OrderQuote>('POST', '/orders/quote', body);
export const createOrder = (body: CreateOrderInput) => send<OrderDetail>('POST', '/orders', body);
export const replaceOrderLines = (id: string, version: number, lines: OrderLineInput[]) =>
  send<OrderDetail>('PUT', `/orders/${id}/lines`, { version, lines });
export const placeOrder = (id: string) => send('POST', `/orders/${id}/place`);
export const cancelOrder = (id: string) => send('POST', `/orders/${id}/cancel`);
export const rejectOrder = (id: string, reason?: string) => send('POST', `/orders/${id}/reject`, { reason });
export const adminDeliveryTime = (id: string, deliveryTime: string, version: number) =>
  send('PUT', `/orders/${id}/admin/delivery-time`, { deliveryTime, version });
export const adminAddress = (id: string, addressId: string, version: number) =>
  send('PUT', `/orders/${id}/admin/address`, { addressId, version });
export const adminPackaging = (id: string, packagingTypeId: string, version: number) =>
  send('PUT', `/orders/${id}/admin/packaging`, { packagingTypeId, version });
