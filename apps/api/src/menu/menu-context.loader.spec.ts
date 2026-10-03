import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceTierService } from '../pricing/price-tier.service.js';
import { PricingContextLoader } from '../pricing/pricing-context.loader.js';
import { PricingContext } from '../pricing/domain/pricing-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MenuContextLoader } from './menu-context.loader.js';

const DEFAULT_TIER = { id: 'tier-standard', code: 'STANDARD', name: 'Standard' };

describe('MenuContextLoader', () => {
  let loader: MenuContextLoader;
  let prisma: {
    company: { findUnique: ReturnType<typeof vi.fn> };
    customerEmployee: { findUnique: ReturnType<typeof vi.fn> };
    companyHiddenCategory: { findMany: ReturnType<typeof vi.fn> };
    companyHiddenDish: { findMany: ReturnType<typeof vi.fn> };
    menuCategory: { findMany: ReturnType<typeof vi.fn> };
    priceTier: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  };
  let priceTierService: { resolveEffectiveTierId: ReturnType<typeof vi.fn> };
  let pricingLoader: { loadForTier: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      company: { findUnique: vi.fn() },
      customerEmployee: { findUnique: vi.fn() },
      companyHiddenCategory: { findMany: vi.fn().mockResolvedValue([]) },
      companyHiddenDish: { findMany: vi.fn().mockResolvedValue([]) },
      menuCategory: { findMany: vi.fn().mockResolvedValue([]) },
      priceTier: { findUniqueOrThrow: vi.fn().mockResolvedValue(DEFAULT_TIER) },
    };
    priceTierService = {
      resolveEffectiveTierId: vi.fn().mockResolvedValue(DEFAULT_TIER.id),
    };
    pricingLoader = {
      loadForTier: vi.fn().mockResolvedValue(
        new PricingContext(DEFAULT_TIER.id, [], []),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MenuContextLoader,
        { provide: PrismaService, useValue: prisma },
        { provide: PriceTierService, useValue: priceTierService },
        { provide: PricingContextLoader, useValue: pricingLoader },
      ],
    }).compile();

    loader = moduleRef.get(MenuContextLoader);
  });

  it('uses the default price tier when the company has none', async () => {
    prisma.company.findUnique.mockResolvedValue({
      id: 'company-1',
      name: 'No tier co',
      priceTierId: null,
      priceTier: null,
    });

    const context = await loader.load({ companyId: 'company-1' });

    expect(priceTierService.resolveEffectiveTierId).toHaveBeenCalledWith(null);
    expect(pricingLoader.loadForTier).toHaveBeenCalledWith(DEFAULT_TIER.id, [
      'dish',
    ]);
    expect(context.priceTier).toEqual(DEFAULT_TIER);
    expect(context.company.priceTierId).toBe(DEFAULT_TIER.id);
  });
});
