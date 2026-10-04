import type { SeedClient } from './seed.js';
import { type SeedOptions } from './seed-runtime.js';
export declare function seedExtendedCatalogue(prisma: SeedClient): Promise<void>;
export declare function seedExtendedPricing(prisma: SeedClient): Promise<void>;
export declare function seedExtendedCompanies(prisma: SeedClient): Promise<void>;
export declare function seedDemoOperations(prisma: SeedClient, options?: SeedOptions): Promise<void>;
export declare function seedRichDemoData(prisma: SeedClient, options?: SeedOptions): Promise<void>;
