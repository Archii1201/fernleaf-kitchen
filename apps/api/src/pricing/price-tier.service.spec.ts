import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PriceTierService } from './price-tier.service.js';
import { PricingContextLoader } from './pricing-context.loader.js';
import {
  DefaultPriceTierMissingError,
  DefaultPriceTierProtectedError,
  InvalidPricingStrategyError,
  PriceTierNameConflictError,
  PriceTierNotFoundError,
  TierCycleError,
} from './pricing.errors.js';

const STANDARD = {
  id: 'tier-standard',
  code: 'STANDARD',
  name: 'Standard',
  strategy: 'EXPLICIT',
  markupBasisPoints: null,
  baseTierId: null,
  isDefault: true,
  active: true,
};

const PARTNER = {
  id: 'tier-partner',
  code: 'PARTNER',
  name: 'Partner',
  strategy: 'BASE_MARKUP',
  markupBasisPoints: 1_500,
  baseTierId: STANDARD.id,
  isDefault: false,
  active: true,
};

function createPrismaMock() {
  return {
    priceTier: {
      findMany: vi.fn().mockResolvedValue([STANDARD, PARTNER]),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

describe('PriceTierService', () => {
  let service: PriceTierService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceTierService,
        PricingContextLoader,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(PriceTierService);
  });

  it('describes each tier rule in the list', async () => {
    const tiers = await service.list();

    expect(tiers.map((tier) => tier.rule)).toEqual([
      'Manual prices',
      'Standard + 15%',
    ]);
    expect(tiers[1].chain).toEqual([PARTNER.id, STANDARD.id]);
  });

  it('rejects a duplicate tier code', async () => {
    prisma.priceTier.findFirst.mockResolvedValue({
      code: 'PARTNER',
      name: 'Other',
    });

    await expect(
      service.create({ code: 'PARTNER', name: 'Other', strategy: 'EXPLICIT' }),
    ).rejects.toThrow(PriceTierNameConflictError);
  });

  it('requires a positive multiplier on a cost-multiplier tier', async () => {
    prisma.priceTier.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        code: 'BAD',
        name: 'Bad',
        strategy: 'COST_MULTIPLIER',
        markupBasisPoints: 0,
      }),
    ).rejects.toThrow(InvalidPricingStrategyError);
  });

  it('requires a base tier on a base-markup tier', async () => {
    prisma.priceTier.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        code: 'BAD',
        name: 'Bad',
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 1_000,
      }),
    ).rejects.toThrow(InvalidPricingStrategyError);
  });

  it('rejects an edit that would create a cycle', async () => {
    prisma.priceTier.findUnique.mockResolvedValue(STANDARD);

    await expect(
      service.update(STANDARD.id, {
        strategy: 'BASE_MARKUP',
        markupBasisPoints: 500,
        baseTierId: PARTNER.id,
      }),
    ).rejects.toThrow(TierCycleError);

    expect(prisma.priceTier.update).not.toHaveBeenCalled();
  });

  it('refuses to deactivate the default tier', async () => {
    prisma.priceTier.findUnique.mockResolvedValue(STANDARD);

    await expect(
      service.update(STANDARD.id, { active: false }),
    ).rejects.toThrow(DefaultPriceTierProtectedError);
  });

  it('switches the default inside one transaction', async () => {
    prisma.priceTier.findUnique
      .mockResolvedValueOnce({ id: PARTNER.id, active: true, isDefault: false })
      .mockResolvedValue({ ...PARTNER, isDefault: true });

    await service.makeDefault(PARTNER.id);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.priceTier.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    expect(prisma.priceTier.update).toHaveBeenCalledWith({
      where: { id: PARTNER.id },
      data: { isDefault: true },
    });
  });

  it('leaves exactly one default when the tier is already default', async () => {
    prisma.priceTier.findUnique.mockResolvedValue({
      ...STANDARD,
      active: true,
      isDefault: true,
    });

    await service.makeDefault(STANDARD.id);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.priceTier.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to make an unknown tier the default', async () => {
    prisma.priceTier.findUnique.mockResolvedValue(null);

    await expect(service.makeDefault('nope')).rejects.toThrow(
      PriceTierNotFoundError,
    );
  });

  it('uses the company tier when present and the default otherwise', async () => {
    prisma.priceTier.findFirst.mockResolvedValue({ id: STANDARD.id });

    await expect(service.resolveEffectiveTierId(PARTNER.id)).resolves.toBe(
      PARTNER.id,
    );
    await expect(service.resolveEffectiveTierId(null)).resolves.toBe(
      STANDARD.id,
    );
  });

  it('fails when no default tier exists', async () => {
    prisma.priceTier.findFirst.mockResolvedValue(null);

    await expect(service.resolveEffectiveTierId(null)).rejects.toThrow(
      DefaultPriceTierMissingError,
    );
  });
});
