import { get, send, type Paginated } from './client';

export interface BillableGroup {
  company: { id: string; name: string };
  orders: { id: string; orderNumber: string; status: string; totalCents: number; deliveryDate: string }[];
  totalCents: number;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID';

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  periodStart: string | null;
  periodEnd: string | null;
  issueDate: string | null;
  dueDate: string | null;
  subtotalCents: number;
  creditCents: number;
  totalCents: number;
  createdAt: string;
  company: { id: string; name: string };
  _count?: { lines: number; orders: number };
}

export interface InvoiceDetail extends Invoice {
  lines: { id: string; type: string; description: string; amountCents: number; orderId: string | null }[];
  orders: { id: string; orderNumber: string; totalCents: number; status: string }[];
}

export const billableOrders = (page: number) =>
  get<Paginated<BillableGroup>>('/billing/orders', { page, limit: 100 });
export const listInvoices = (page: number) => get<Paginated<Invoice>>('/invoices', { page, limit: 20 });
export const getInvoice = (id: string) => get<InvoiceDetail>(`/invoices/${id}`);
export const createInvoice = (orderIds: string[]) => send<InvoiceDetail>('POST', '/invoices', { orderIds });
export const voidInvoice = (id: string) => send('POST', `/invoices/${id}/void`);
export const markInvoicePaid = (id: string) => send('POST', `/invoices/${id}/paid`);
export const createCredit = (orderId: string, body: { amountCents: number; reason: string; invoiceId?: string }) =>
  send('POST', `/orders/${orderId}/credits`, body);
