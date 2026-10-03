import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CompanyAddressNotOwnedError,
  CompanyNotFoundError,
} from '../companies/companies.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  EmployeeDomainMismatchError,
  EmployeeEmailConflictError,
  EmployeeNotFoundError,
  EmployeeOwnsCompanyError,
  UnknownEmployeeReferenceError,
} from './employees.errors.js';
import { EmployeesService } from './employees.service.js';

const COMPANY_A = 'company-a';
const COMPANY_B = 'company-b';
const EMPLOYEE_ID = 'employee-alice';

const EMPLOYEE_ROW = {
  id: EMPLOYEE_ID,
  companyId: COMPANY_A,
  email: 'alice@northwind.com',
  fullName: 'Alice Mehta',
  phone: null,
  defaultAddressId: 'address-a',
  canChooseAddress: true,
  canChooseDeliveryTime: false,
  canChoosePackaging: false,
  allergyNotes: null,
  dietaryNotes: null,
  active: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  company: { id: COMPANY_A, name: 'Northwind' },
  defaultAddress: { id: 'address-a', label: 'HQ', city: 'Bengaluru' },
  allergens: [],
  dietaryTags: [],
  ownedCompany: null,
};

/** Domains per company, used by the approved-domain check. */
const DOMAINS: Record<string, { domain: string }[]> = {
  [COMPANY_A]: [{ domain: 'northwind.com' }],
  [COMPANY_B]: [{ domain: 'contoso.com' }, { domain: 'northwind.com' }],
};

function createPrismaMock() {
  return {
    customerEmployee: {
      findUnique: vi.fn().mockResolvedValue(EMPLOYEE_ROW),
      findMany: vi.fn().mockResolvedValue([EMPLOYEE_ROW]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue({ id: EMPLOYEE_ID }),
      update: vi.fn(),
    },
    customerEmployeeAllergen: { deleteMany: vi.fn(), createMany: vi.fn() },
    customerEmployeeDietaryTag: { deleteMany: vi.fn(), createMany: vi.fn() },
    company: { findUnique: vi.fn().mockResolvedValue({ id: COMPANY_A }) },
    companyDomain: {
      findMany: vi.fn(
        async ({ where }: { where: { companyId: string } }) =>
          DOMAINS[where.companyId] ?? [],
      ),
    },
    companyAddress: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'address-a', companyId: COMPANY_A }),
    },
    allergen: { findMany: vi.fn().mockResolvedValue([]) },
    dietaryTag: { findMany: vi.fn().mockResolvedValue([]) },
    // Deliberately present so a stray write to orders would be visible.
    order: { update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
}

describe('EmployeesService', () => {
  let service: EmployeesService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(EmployeesService);
  });

  const baseCreate = {
    companyId: COMPANY_A,
    email: '  Alice@Northwind.COM ',
    fullName: 'Alice Mehta',
  };

  describe('create', () => {
    beforeEach(() => {
      // No existing employee with that email.
      prisma.customerEmployee.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue(EMPLOYEE_ROW);
    });

    it('creates an employee inside exactly one company, normalizing the email', async () => {
      await service.create(baseCreate);

      expect(prisma.customerEmployee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_A,
            email: 'alice@northwind.com',
          }),
        }),
      );
    });

    it('stores the delivery permission flags', async () => {
      await service.create({
        ...baseCreate,
        canChooseAddress: true,
        canChooseDeliveryTime: true,
        canChoosePackaging: false,
      });

      expect(prisma.customerEmployee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            canChooseAddress: true,
            canChooseDeliveryTime: true,
            canChoosePackaging: false,
          }),
        }),
      );
    });

    it('stores allergies and dietary preferences from reference data', async () => {
      prisma.allergen.findMany.mockResolvedValue([{ id: 'allergen-nuts' }]);
      prisma.dietaryTag.findMany.mockResolvedValue([{ id: 'tag-vegan' }]);

      await service.create({
        ...baseCreate,
        allergenIds: ['allergen-nuts'],
        dietaryTagIds: ['tag-vegan'],
        allergyNotes: 'Severe',
      });

      expect(prisma.customerEmployeeAllergen.createMany).toHaveBeenCalledWith({
        data: [
          { customerEmployeeId: EMPLOYEE_ID, allergenId: 'allergen-nuts' },
        ],
      });
      expect(prisma.customerEmployeeDietaryTag.createMany).toHaveBeenCalledWith(
        {
          data: [
            { customerEmployeeId: EMPLOYEE_ID, dietaryTagId: 'tag-vegan' },
          ],
        },
      );
    });

    it('rejects unknown allergen references', async () => {
      prisma.allergen.findMany.mockResolvedValue([]);

      await expect(
        service.create({ ...baseCreate, allergenIds: ['missing'] }),
      ).rejects.toThrow(UnknownEmployeeReferenceError);
    });

    it('rejects an unknown company', async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.create(baseCreate)).rejects.toThrow(
        CompanyNotFoundError,
      );
    });

    it('rejects an email outside the company approved domains', async () => {
      await expect(
        service.create({ ...baseCreate, email: 'alice@gmail.com' }),
      ).rejects.toThrow(EmployeeDomainMismatchError);
    });

    it('rejects a duplicate email', async () => {
      prisma.customerEmployee.findUnique.mockReset();
      prisma.customerEmployee.findUnique.mockResolvedValue({ id: 'other' });

      await expect(service.create(baseCreate)).rejects.toThrow(
        EmployeeEmailConflictError,
      );
    });

    it('rejects an address belonging to another company', async () => {
      prisma.companyAddress.findUnique.mockResolvedValue({
        id: 'address-x',
        companyId: COMPANY_B,
      });

      await expect(
        service.create({ ...baseCreate, defaultAddressId: 'address-x' }),
      ).rejects.toThrow(CompanyAddressNotOwnedError);
    });
  });

  describe('list', () => {
    it('filters by company and paginates', async () => {
      const result = await service.list({
        companyId: COMPANY_A,
        page: 2,
        limit: 10,
        skip: 10,
        take: 10,
      } as never);

      expect(prisma.customerEmployee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_A }),
          skip: 10,
          take: 10,
        }),
      );
      expect(result.meta).toMatchObject({ page: 2, limit: 10, total: 1 });
    });
  });

  describe('update', () => {
    it('404s for an unknown employee', async () => {
      prisma.customerEmployee.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', {})).rejects.toThrow(
        EmployeeNotFoundError,
      );
    });

    it('refuses to deactivate the owner of a company', async () => {
      prisma.customerEmployee.findUnique.mockResolvedValue({
        ...EMPLOYEE_ROW,
        ownedCompany: { id: COMPANY_A },
      });

      await expect(
        service.update(EMPLOYEE_ID, { active: false }),
      ).rejects.toThrow(EmployeeOwnsCompanyError);
      expect(prisma.customerEmployee.update).not.toHaveBeenCalled();
    });

    it('updates delivery permissions in place', async () => {
      await service.update(EMPLOYEE_ID, { canChoosePackaging: true });

      expect(prisma.customerEmployee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_A,
            canChoosePackaging: true,
          }),
        }),
      );
    });
  });

  describe('moving an employee between companies', () => {
    it('moves the employee and nothing else', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_B });

      await service.update(EMPLOYEE_ID, { companyId: COMPANY_B });

      const [[call]] = prisma.customerEmployee.update.mock.calls;

      expect(call.data.companyId).toBe(COMPANY_B);
      // The old company's address cannot travel with them.
      expect(call.data.defaultAddressId).toBeNull();
    });

    it('never rewrites historical orders', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_B });

      await service.update(EMPLOYEE_ID, { companyId: COMPANY_B });

      // Orders carry their own companyId plus an address snapshot, so order
      // history stays with the company that actually placed it.
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('re-checks the approved domain against the new company', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_B });
      prisma.companyDomain.findMany.mockResolvedValue([
        { domain: 'contoso.com' },
      ]);

      await expect(
        service.update(EMPLOYEE_ID, { companyId: COMPANY_B }),
      ).rejects.toThrow(EmployeeDomainMismatchError);
    });

    it('refuses to move the owner of a company', async () => {
      prisma.customerEmployee.findUnique.mockResolvedValue({
        ...EMPLOYEE_ROW,
        ownedCompany: { id: COMPANY_A },
      });
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_B });

      await expect(
        service.update(EMPLOYEE_ID, { companyId: COMPANY_B }),
      ).rejects.toThrow(EmployeeOwnsCompanyError);
      expect(prisma.customerEmployee.update).not.toHaveBeenCalled();
    });
  });
});
