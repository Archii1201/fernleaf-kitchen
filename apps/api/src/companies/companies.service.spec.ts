import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLOCK, FixedClock } from '../kitchen/time/clock.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { PriceTierNotFoundError } from '../pricing/pricing.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CompanyAddressConflictError,
  CompanyDomainAlreadyUsedError,
  CompanyMustKeepOneDomainError,
  CompanyNotFoundError,
  CompanyOwnerInvalidError,
  DuplicateCompanyDomainError,
  InvalidWorkingDayError,
  PublicEmailDomainError,
} from './companies.errors.js';
import { CompaniesService } from './companies.service.js';
import { DriverEligibilityService } from './domain/driver-eligibility.service.js';

const COMPANY_ID = 'company-1';

const COMPANY_ROW = {
  id: COMPANY_ID,
  name: 'Northwind Analytics',
  legalName: null,
  active: true,
  billingContactName: 'Bill Ops',
  billingContactEmail: 'billing@northwind.com',
  billingContactPhone: '+91 99999 11111',
  ownerEmployeeId: null,
  defaultAddressId: null,
  defaultDeliveryTime: null,
  defaultPackagingTypeId: null,
  leaveKitchenMinutes: 60,
  driverInstructions: null,
  defaultDriverStaffId: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  priceTier: { id: 'tier-standard', code: 'STANDARD', name: 'Standard' },
  owner: null,
  defaultDriver: null,
  defaultPackaging: null,
  domains: [{ id: 'domain-1', domain: 'northwind.com' }],
  addresses: [],
  workingDays: [{ weekday: 'WEDNESDAY' }, { weekday: 'MONDAY' }],
  _count: { employees: 3 },
};

function createPrismaMock() {
  return {
    company: {
      findUnique: vi.fn().mockResolvedValue(COMPANY_ROW),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([COMPANY_ROW]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue({ id: COMPANY_ID }),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    companyDomain: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(2),
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    companyAddress: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    companyWorkingDay: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    companyHoliday: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    companyHiddenCategory: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    companyHiddenDish: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    customerEmployee: { findUnique: vi.fn(), updateMany: vi.fn() },
    priceTier: { findUnique: vi.fn().mockResolvedValue({ id: 'tier-standard' }) },
    packagingType: { findUnique: vi.fn().mockResolvedValue({ id: 'pack-1' }) },
    menuCategory: { findMany: vi.fn().mockResolvedValue([]) },
    dish: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
}

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let driverEligibility: { assertEligible: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );
    driverEligibility = { assertEligible: vi.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompaniesService,
        KitchenTime,
        {
          provide: CLOCK,
          useValue: new FixedClock(new Date('2026-10-07T06:00:00Z')),
        },
        { provide: ConfigService, useValue: { get: () => 'Asia/Kolkata' } },
        { provide: PrismaService, useValue: prisma },
        { provide: DriverEligibilityService, useValue: driverEligibility },
      ],
    }).compile();

    service = moduleRef.get(CompaniesService);
  });

  const baseCreate = {
    name: 'Northwind Analytics',
    priceTierId: 'tier-standard',
    domains: ['Northwind.com'],
  };

  describe('create', () => {
    it('creates a company with normalized domains and a default working week', async () => {
      await service.create(baseCreate);

      expect(prisma.companyDomain.createMany).toHaveBeenCalledWith({
        data: [{ companyId: COMPANY_ID, domain: 'northwind.com' }],
      });
      expect(prisma.companyWorkingDay.createMany).toHaveBeenCalledWith({
        data: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
        ].map((weekday) => ({ companyId: COMPANY_ID, weekday })),
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('creates multiple addresses in the same transaction', async () => {
      await service.create({
        ...baseCreate,
        addresses: [
          {
            label: 'Head office',
            line1: '1 Residency Road',
            city: 'Bengaluru',
            postalCode: '560025',
          },
          {
            label: 'Annexe',
            line1: '2 Residency Road',
            city: 'Bengaluru',
            postalCode: '560025',
          },
        ],
      });

      expect(prisma.companyAddress.create).toHaveBeenCalledTimes(2);
    });

    it('rejects two addresses with the same label', async () => {
      await expect(
        service.create({
          ...baseCreate,
          addresses: [
            {
              label: 'Head office',
              line1: 'a',
              city: 'Bengaluru',
              postalCode: '560025',
            },
            {
              label: 'Head office',
              line1: 'b',
              city: 'Bengaluru',
              postalCode: '560025',
            },
          ],
        }),
      ).rejects.toThrow(CompanyAddressConflictError);
    });

    it('rejects a public email domain', async () => {
      await expect(
        service.create({ ...baseCreate, domains: ['gmail.com'] }),
      ).rejects.toThrow(PublicEmailDomainError);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects the same domain listed twice', async () => {
      await expect(
        service.create({
          ...baseCreate,
          domains: ['northwind.com', '@NORTHWIND.com'],
        }),
      ).rejects.toThrow(DuplicateCompanyDomainError);
    });

    it('rejects a domain already owned by another company', async () => {
      prisma.companyDomain.findMany.mockResolvedValue([
        { domain: 'northwind.com' },
      ]);

      await expect(service.create(baseCreate)).rejects.toThrow(
        CompanyDomainAlreadyUsedError,
      );
    });

    it('rejects an unknown price tier', async () => {
      prisma.priceTier.findUnique.mockResolvedValue(null);

      await expect(service.create(baseCreate)).rejects.toThrow(
        PriceTierNotFoundError,
      );
    });

    it('creates a company with no price tier so the default applies later', async () => {
      const { priceTierId: _ignored, ...withoutTier } = baseCreate;
      await service.create(withoutTier);

      expect(prisma.priceTier.findUnique).not.toHaveBeenCalled();
      expect(prisma.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ priceTierId: null }),
        }),
      );
    });

    it('clears an assigned price tier', async () => {
      await service.updatePriceTier(COMPANY_ID, { priceTierId: null });

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_ID },
        data: { priceTierId: null },
      });
    });

    it('rejects an empty working week', async () => {
      await expect(
        service.create({ ...baseCreate, workingDays: [] }),
      ).rejects.toThrow(InvalidWorkingDayError);
    });
  });

  describe('domains', () => {
    it('adds a normalized domain', async () => {
      await service.addDomain(COMPANY_ID, { domain: ' @Acme.CO.uk ' });

      expect(prisma.companyDomain.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { companyId: COMPANY_ID, domain: 'acme.co.uk' },
        }),
      );
    });

    it('rejects a domain this company already has', async () => {
      prisma.companyDomain.findUnique.mockResolvedValue({
        companyId: COMPANY_ID,
      });

      await expect(
        service.addDomain(COMPANY_ID, { domain: 'northwind.com' }),
      ).rejects.toThrow(DuplicateCompanyDomainError);
    });

    it('rejects a domain owned by a different company', async () => {
      prisma.companyDomain.findUnique.mockResolvedValue({
        companyId: 'company-2',
      });

      await expect(
        service.addDomain(COMPANY_ID, { domain: 'northwind.com' }),
      ).rejects.toThrow(CompanyDomainAlreadyUsedError);
    });

    it('refuses to remove the last domain', async () => {
      prisma.companyDomain.findFirst.mockResolvedValue({ id: 'domain-1' });
      prisma.companyDomain.count.mockResolvedValue(1);

      await expect(
        service.removeDomain(COMPANY_ID, 'domain-1'),
      ).rejects.toThrow(CompanyMustKeepOneDomainError);
      expect(prisma.companyDomain.delete).not.toHaveBeenCalled();
    });
  });

  describe('owner', () => {
    it('accepts an active employee of the same company', async () => {
      prisma.customerEmployee.findUnique.mockResolvedValue({
        companyId: COMPANY_ID,
        active: true,
      });

      await service.update(COMPANY_ID, { ownerEmployeeId: 'employee-1' });

      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerEmployeeId: 'employee-1' }),
        }),
      );
    });

    it('rejects an employee from another company', async () => {
      prisma.customerEmployee.findUnique.mockResolvedValue({
        companyId: 'company-2',
        active: true,
      });

      await expect(
        service.update(COMPANY_ID, { ownerEmployeeId: 'employee-1' }),
      ).rejects.toThrow(CompanyOwnerInvalidError);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });
  });

  describe('calendar and delivery defaults', () => {
    it('replaces the working week transactionally', async () => {
      await service.replaceCalendar(COMPANY_ID, {
        workingDays: ['TUESDAY', 'MONDAY'],
      });

      expect(prisma.companyWorkingDay.deleteMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, weekday: { notIn: ['MONDAY', 'TUESDAY'] } },
      });
      expect(prisma.companyWorkingDay.upsert).toHaveBeenCalledTimes(2);
    });

    it('stores a holiday as a UTC-midnight date', async () => {
      prisma.companyHoliday.create.mockResolvedValue({
        id: 'holiday-1',
        date: new Date('2026-12-25T00:00:00Z'),
        name: 'Christmas',
      });

      const holiday = await service.addHoliday(COMPANY_ID, {
        date: '2026-12-25',
        name: 'Christmas',
      });

      expect(prisma.companyHoliday.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_ID,
          date: new Date('2026-12-25T00:00:00Z'),
          name: 'Christmas',
        },
      });
      expect(holiday).toMatchObject({ date: '2026-12-25' });
    });

    it('saves delivery defaults and checks driver eligibility', async () => {
      prisma.companyAddress.findUnique.mockResolvedValue({
        id: 'address-1',
        companyId: COMPANY_ID,
        label: 'Head office',
      });

      await service.updateDeliveryDefaults(COMPANY_ID, {
        defaultAddressId: 'address-1',
        defaultDeliveryTime: '12:30',
        leaveKitchenMinutes: 45,
        driverInstructions: 'Use the service lift.',
        defaultDriverStaffId: 'staff-driver',
      });

      expect(driverEligibility.assertEligible).toHaveBeenCalledWith(
        'staff-driver',
      );
      expect(prisma.company.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leaveKitchenMinutes: 45,
            defaultDeliveryTime: new Date('1970-01-01T12:30:00Z'),
            defaultDriverStaffId: 'staff-driver',
          }),
        }),
      );
    });

    it('rejects an unknown company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.getById('nope')).rejects.toThrow(
        CompanyNotFoundError,
      );
    });
  });

  describe('menu visibility', () => {
    it('replaces hidden categories and dishes in one transaction', async () => {
      prisma.menuCategory.findMany.mockResolvedValue([{ id: 'cat-1' }]);
      prisma.dish.findMany.mockResolvedValue([{ id: 'dish-1' }]);

      await service.replaceMenuVisibility(COMPANY_ID, {
        hiddenCategoryIds: ['cat-1'],
        hiddenDishIds: ['dish-1'],
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.companyHiddenCategory.deleteMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID },
      });
      expect(prisma.companyHiddenDish.createMany).toHaveBeenCalledWith({
        data: [{ companyId: COMPANY_ID, dishId: 'dish-1' }],
      });
    });

    it('rejects unknown catalogue references', async () => {
      prisma.menuCategory.findMany.mockResolvedValue([]);

      await expect(
        service.replaceMenuVisibility(COMPANY_ID, {
          hiddenCategoryIds: ['missing'],
          hiddenDishIds: [],
        }),
      ).rejects.toThrow('menuCategory references do not exist');
    });
  });
});
