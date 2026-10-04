import type { Prisma, OrderStatus } from '@prisma/client';
import { KitchenTime } from '../src/kitchen/time/kitchen-time.js';
import type { SeedClient } from './seed.js';
export interface SeedOptions {
    now?: Date;
    timeZone?: string;
}
export declare function seedTime(options?: SeedOptions): KitchenTime;
export declare function relativeSeedDate(time: KitchenTime, offset: number): Date;
export declare function transactionSeedClient(tx: Prisma.TransactionClient): SeedClient;
export declare function createSeedScenario(prisma: SeedClient, input: {
    orderNumber: string;
    employeeId: string;
    dishId: string;
    deliveryDate: Date;
    status: OrderStatus;
    driverId?: string;
    deliveryTime?: string;
}, options?: SeedOptions): Promise<string>;
export declare function seedDailyReviewData(prisma: SeedClient, options?: SeedOptions): Promise<{
    created: string[];
}>;
