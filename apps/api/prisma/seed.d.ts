import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { type RoleName } from '../src/auth/permissions.js';
import type { SeedOptions } from './seed-runtime.js';
export declare const STAFF_ACCOUNTS: ReadonlyArray<{
    email: string;
    role: RoleName;
    staffCode: string;
    fullName: string;
}>;
export declare const SEED_PASSWORD = "Test@1234";
export type SeedClient = PrismaClient;
export declare function seedAuth(prisma: SeedClient): Promise<void>;
export declare const DEFAULT_CUTOFF_TIME: Date;
export declare const DEFAULT_CUTOFF_WORKING_DAYS = 2;
export declare const SETTINGS_SINGLETON_ID = "singleton";
export declare function seedKitchenSettings(prisma: SeedClient): Promise<void>;
export declare function seedReferenceData(prisma: SeedClient): Promise<void>;
export declare function seedCatalogueSamples(prisma: SeedClient): Promise<void>;
export declare function seedPricing(prisma: SeedClient): Promise<void>;
export declare function seedCompanies(prisma: SeedClient): Promise<void>;
export declare function seedMenu(prisma: SeedClient): Promise<void>;
export declare function databaseIsEmpty(prisma: SeedClient): Promise<boolean>;
export declare function seedAll(prisma: SeedClient, options?: SeedOptions): Promise<void>;
export declare function seedIfNeeded(prisma: SeedClient, options?: SeedOptions & {
    force?: boolean;
}): Promise<{
    seeded: boolean;
}>;
export declare function createSeedClient(): PrismaClient;
