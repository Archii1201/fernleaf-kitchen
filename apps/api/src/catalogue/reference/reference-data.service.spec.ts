import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReferenceConflictError } from '../catalogue.errors.js';
import { ReferenceDataService } from './reference-data.service.js';

function createPrismaMock() {
  return {
    allergen: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('ReferenceDataService', () => {
  let service: ReferenceDataService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceDataService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(ReferenceDataService);
  });

  it('rejects a duplicate code with 409', async () => {
    prisma.allergen.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createAllergen({ code: 'NUTS', name: 'Tree nuts' }),
    ).rejects.toBeInstanceOf(ReferenceConflictError);
  });

  it('lists deactivated rows unless filtered out', async () => {
    prisma.allergen.findMany.mockResolvedValue([
      { id: '1', code: 'NUTS', name: 'Nuts', active: false },
    ]);

    const all = await service.listAllergens();
    expect(all[0].active).toBe(false);

    await service.listAllergens({ active: true });
    expect(prisma.allergen.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });
});
