import type { Prisma } from '@prisma/client';
import type { SeedClient } from './seed.js';
export declare const DEMO_CREDIT_REASON = "P0-7 demo: refund for one meal";
export declare function upsertFinancialDemoOrder(prisma: SeedClient, header: Omit<Prisma.OrderUncheckedCreateInput, 'subtotalCents' | 'totalCents' | 'lines'>, dishId: string): Promise<string>;
export declare function upsertFinancialDemoInvoice(prisma: SeedClient, invoiceNumber: string, orderId: string, status: 'ISSUED' | 'PAID' | 'VOID', withCredit?: boolean): Promise<void>;
