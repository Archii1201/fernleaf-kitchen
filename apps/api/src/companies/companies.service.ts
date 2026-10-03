import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  paginate,
  type PaginatedResponse,
} from '../common/pagination/index.js';
import { KitchenTime } from '../kitchen/time/kitchen-time.js';
import { WEEKDAYS, type Weekday } from '../kitchen/time/weekday.js';
import { PriceTierNotFoundError } from '../pricing/pricing.errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CompanyAddressConflictError,
  CompanyAddressNotFoundError,
  CompanyAddressNotOwnedError,
  CompanyDomainAlreadyUsedError,
  CompanyDomainNotFoundError,
  CompanyHolidayNotFoundError,
  CompanyMustKeepOneDomainError,
  CompanyNameConflictError,
  CompanyNotFoundError,
  CompanyOwnerInvalidError,
  DuplicateCompanyDomainError,
  DuplicateCompanyHolidayError,
  InvalidWorkingDayError,
  MenuReferenceNotFoundError,
  PackagingTypeNotFoundError,
} from './companies.errors.js';
import { DriverEligibilityService } from './domain/driver-eligibility.service.js';
import { normalizeCompanyDomain } from './domain/email-domain.js';
import type {
  AddCompanyDomainDto,
  CompanyAddressInputDto,
  CreateCompanyDto,
  CreateCompanyHolidayDto,
  ListCompanyQueryDto,
  UpdateCompanyAddressDto,
  UpdateCompanyCalendarDto,
  UpdateCompanyDto,
  UpdateCompanyPriceTierDto,
  UpdateDeliveryDefaultsDto,
  UpdateMenuVisibilityDto,
} from './dto/company.dto.js';

const COMPANY_SELECT = {
  id: true,
  name: true,
  legalName: true,
  active: true,
  billingContactName: true,
  billingContactEmail: true,
  billingContactPhone: true,
  ownerEmployeeId: true,
  defaultAddressId: true,
  defaultDeliveryTime: true,
  defaultPackagingTypeId: true,
  leaveKitchenMinutes: true,
  driverInstructions: true,
  defaultDriverStaffId: true,
  createdAt: true,
  updatedAt: true,
  priceTier: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, fullName: true, email: true } },
  defaultDriver: { select: { id: true, staffCode: true, fullName: true } },
  defaultPackaging: { select: { id: true, code: true, name: true } },
  domains: { select: { id: true, domain: true }, orderBy: { domain: 'asc' } },
  addresses: {
    where: { active: true },
    orderBy: { label: 'asc' },
    select: {
      id: true,
      label: true,
      line1: true,
      line2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      deliveryNotes: true,
      active: true,
    },
  },
  workingDays: { select: { weekday: true } },
  _count: { select: { employees: true } },
} as const;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenTime: KitchenTime,
    private readonly driverEligibility: DriverEligibilityService,
  ) {}

  // -------------------------------------------------------------------------
  // Companies
  // -------------------------------------------------------------------------

  listEligibleDrivers(): Promise<
    { id: string; staffCode: string; fullName: string }[]
  > {
    return this.driverEligibility.listEligible();
  }

  async list(query: ListCompanyQueryDto): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.CompanyWhereInput = {
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                domains: {
                  some: {
                    domain: { contains: query.search.toLowerCase() },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        select: COMPANY_SELECT,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return paginate(rows.map((row) => this.toResponse(row)), {
      page: query.page,
      limit: query.limit,
      total,
    });
  }

  async getById(id: string): Promise<unknown> {
    return this.toResponse(await this.findOrThrow(id));
  }

  /**
   * Creating a company writes the company, its domains, its addresses and its
   * working week. One transaction, because a company with no domain cannot be
   * matched to an employee and a company with no working day cannot receive a
   * delivery - a half-created company is unusable, not merely incomplete.
   */
  async create(dto: CreateCompanyDto): Promise<unknown> {
    if (dto.priceTierId) {
      await this.assertPriceTierExists(dto.priceTierId);
    }
    await this.assertNameAvailable(dto.name);

    const domains = this.normalizeDomains(dto.domains);
    await this.assertDomainsFree(domains);

    const workingDays = this.validateWorkingDays(
      (dto.workingDays as Weekday[] | undefined) ?? DEFAULT_WORKING_WEEK,
    );
    const addresses = dto.addresses ?? [];
    this.assertAddressLabelsUnique(addresses);

    const id = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name,
          legalName: dto.legalName ?? null,
          priceTierId: dto.priceTierId ?? null,
          billingContactName: dto.billingContactName ?? null,
          billingContactEmail: dto.billingContactEmail?.trim().toLowerCase() ?? null,
          billingContactPhone: dto.billingContactPhone ?? null,
          active: true,
        },
        select: { id: true },
      });

      await tx.companyDomain.createMany({
        data: domains.map((domain) => ({ companyId: company.id, domain })),
      });

      for (const address of addresses) {
        await tx.companyAddress.create({
          data: this.addressData(company.id, address),
        });
      }

      await tx.companyWorkingDay.createMany({
        data: workingDays.map((weekday) => ({
          companyId: company.id,
          weekday,
        })),
      });

      return company.id;
    });

    return this.getById(id);
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<unknown> {
    const company = await this.findOrThrow(id);

    if (dto.name !== undefined && dto.name !== company.name) {
      await this.assertNameAvailable(dto.name);
    }

    if (dto.ownerEmployeeId !== undefined) {
      await this.assertOwnerBelongsToCompany(id, dto.ownerEmployeeId);
    }

    await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.legalName === undefined ? {} : { legalName: dto.legalName }),
        ...(dto.billingContactName === undefined
          ? {}
          : { billingContactName: dto.billingContactName }),
        ...(dto.billingContactEmail === undefined
          ? {}
          : {
              billingContactEmail: dto.billingContactEmail.trim().toLowerCase(),
            }),
        ...(dto.billingContactPhone === undefined
          ? {}
          : { billingContactPhone: dto.billingContactPhone }),
        ...(dto.ownerEmployeeId === undefined
          ? {}
          : { ownerEmployeeId: dto.ownerEmployeeId }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
    });

    return this.getById(id);
  }

  async updatePriceTier(
    id: string,
    dto: UpdateCompanyPriceTierDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);
    if (dto.priceTierId) {
      await this.assertPriceTierExists(dto.priceTierId);
    }

    await this.prisma.company.update({
      where: { id },
      data: { priceTierId: dto.priceTierId ?? null },
    });

    return this.getById(id);
  }

  // -------------------------------------------------------------------------
  // Domains
  // -------------------------------------------------------------------------

  async listDomains(id: string): Promise<unknown[]> {
    await this.findOrThrow(id);

    return this.prisma.companyDomain.findMany({
      where: { companyId: id },
      select: { id: true, domain: true, createdAt: true },
      orderBy: { domain: 'asc' },
    });
  }

  async addDomain(id: string, dto: AddCompanyDomainDto): Promise<unknown> {
    await this.findOrThrow(id);

    const domain = normalizeCompanyDomain(dto.domain);
    const existing = await this.prisma.companyDomain.findUnique({
      where: { domain },
      select: { companyId: true },
    });

    if (existing) {
      throw existing.companyId === id
        ? new DuplicateCompanyDomainError(domain)
        : new CompanyDomainAlreadyUsedError(domain);
    }

    return this.prisma.companyDomain.create({
      data: { companyId: id, domain },
      select: { id: true, domain: true, createdAt: true },
    });
  }

  async removeDomain(id: string, domainId: string): Promise<void> {
    await this.findOrThrow(id);

    const domain = await this.prisma.companyDomain.findFirst({
      where: { id: domainId, companyId: id },
      select: { id: true },
    });

    if (!domain) {
      throw new CompanyDomainNotFoundError(domainId);
    }

    const remaining = await this.prisma.companyDomain.count({
      where: { companyId: id },
    });

    if (remaining <= 1) {
      throw new CompanyMustKeepOneDomainError();
    }

    await this.prisma.companyDomain.delete({ where: { id: domainId } });
  }

  // -------------------------------------------------------------------------
  // Addresses
  // -------------------------------------------------------------------------

  async listAddresses(id: string): Promise<unknown[]> {
    await this.findOrThrow(id);

    return this.prisma.companyAddress.findMany({
      where: { companyId: id },
      orderBy: [{ active: 'desc' }, { label: 'asc' }],
    });
  }

  async addAddress(
    id: string,
    dto: CompanyAddressInputDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);
    await this.assertAddressLabelFree(id, dto.label);

    return this.prisma.companyAddress.create({
      data: this.addressData(id, dto),
    });
  }

  async updateAddress(
    id: string,
    addressId: string,
    dto: UpdateCompanyAddressDto,
  ): Promise<unknown> {
    const address = await this.findAddressOrThrow(id, addressId);

    if (dto.label !== undefined && dto.label !== address.label) {
      await this.assertAddressLabelFree(id, dto.label);
    }

    return this.prisma.companyAddress.update({
      where: { id: addressId },
      data: {
        ...(dto.label === undefined ? {} : { label: dto.label }),
        ...(dto.line1 === undefined ? {} : { line1: dto.line1 }),
        ...(dto.line2 === undefined ? {} : { line2: dto.line2 }),
        ...(dto.city === undefined ? {} : { city: dto.city }),
        ...(dto.state === undefined ? {} : { state: dto.state }),
        ...(dto.postalCode === undefined ? {} : { postalCode: dto.postalCode }),
        ...(dto.country === undefined
          ? {}
          : { country: dto.country.toUpperCase() }),
        ...(dto.deliveryNotes === undefined
          ? {}
          : { deliveryNotes: dto.deliveryNotes }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
    });
  }

  /**
   * Addresses are retired, not deleted: historical orders hold a `Restrict`
   * foreign key to the address they were delivered to, alongside a snapshot of
   * its text. Deactivating keeps both intact.
   */
  async deactivateAddress(id: string, addressId: string): Promise<void> {
    await this.findAddressOrThrow(id, addressId);

    await this.prisma.$transaction(async (tx) => {
      await tx.companyAddress.update({
        where: { id: addressId },
        data: { active: false },
      });

      // A retired address must not stay as the company default.
      await tx.company.updateMany({
        where: { id, defaultAddressId: addressId },
        data: { defaultAddressId: null },
      });

      await tx.customerEmployee.updateMany({
        where: { companyId: id, defaultAddressId: addressId },
        data: { defaultAddressId: null },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Calendar (company receiving calendar - NOT the kitchen cutoff calendar)
  // -------------------------------------------------------------------------

  async getCalendar(id: string): Promise<unknown> {
    await this.findOrThrow(id);

    const [workingDays, holidays] = await Promise.all([
      this.prisma.companyWorkingDay.findMany({
        where: { companyId: id },
        select: { weekday: true },
      }),
      this.prisma.companyHoliday.findMany({
        where: { companyId: id },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      workingDays: this.sortWeekdays(
        workingDays.map((row) => row.weekday as Weekday),
      ),
      holidays: holidays.map((holiday) => ({
        id: holiday.id,
        date: this.kitchenTime.toDateString(holiday.date),
        name: holiday.name,
      })),
    };
  }

  async replaceCalendar(
    id: string,
    dto: UpdateCompanyCalendarDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);

    const workingDays = this.validateWorkingDays(dto.workingDays as Weekday[]);

    await this.prisma.$transaction(async (tx) => {
      await tx.companyWorkingDay.deleteMany({
        where: { companyId: id, weekday: { notIn: workingDays } },
      });

      for (const weekday of workingDays) {
        await tx.companyWorkingDay.upsert({
          where: { companyId_weekday: { companyId: id, weekday } },
          update: {},
          create: { companyId: id, weekday },
        });
      }
    });

    return this.getCalendar(id);
  }

  async addHoliday(
    id: string,
    dto: CreateCompanyHolidayDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);

    // Reuses the kitchen time helper purely for UTC-safe @db.Date handling;
    // the holiday itself belongs to the company calendar.
    const date = this.kitchenTime.fromDateString(dto.date);

    const existing = await this.prisma.companyHoliday.findUnique({
      where: { companyId_date: { companyId: id, date } },
      select: { id: true },
    });

    if (existing) {
      throw new DuplicateCompanyHolidayError(dto.date);
    }

    const created = await this.prisma.companyHoliday.create({
      data: { companyId: id, date, name: dto.name ?? null },
    });

    return {
      id: created.id,
      date: this.kitchenTime.toDateString(created.date),
      name: created.name,
    };
  }

  async removeHoliday(id: string, holidayId: string): Promise<void> {
    await this.findOrThrow(id);

    const holiday = await this.prisma.companyHoliday.findFirst({
      where: { id: holidayId, companyId: id },
      select: { id: true },
    });

    if (!holiday) {
      throw new CompanyHolidayNotFoundError(holidayId);
    }

    await this.prisma.companyHoliday.delete({ where: { id: holidayId } });
  }

  // -------------------------------------------------------------------------
  // Delivery defaults
  // -------------------------------------------------------------------------

  async updateDeliveryDefaults(
    id: string,
    dto: UpdateDeliveryDefaultsDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);

    if (dto.defaultAddressId) {
      await this.findAddressOrThrow(id, dto.defaultAddressId);
    }

    if (dto.defaultPackagingTypeId) {
      const packaging = await this.prisma.packagingType.findUnique({
        where: { id: dto.defaultPackagingTypeId },
        select: { id: true },
      });

      if (!packaging) {
        throw new PackagingTypeNotFoundError(dto.defaultPackagingTypeId);
      }
    }

    if (dto.defaultDriverStaffId) {
      await this.driverEligibility.assertEligible(dto.defaultDriverStaffId);
    }

    await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.defaultAddressId === undefined
          ? {}
          : { defaultAddressId: dto.defaultAddressId }),
        ...(dto.defaultDeliveryTime === undefined
          ? {}
          : {
              defaultDeliveryTime:
                dto.defaultDeliveryTime === null
                  ? null
                  : this.kitchenTime.fromTimeString(dto.defaultDeliveryTime),
            }),
        ...(dto.defaultPackagingTypeId === undefined
          ? {}
          : { defaultPackagingTypeId: dto.defaultPackagingTypeId }),
        ...(dto.leaveKitchenMinutes === undefined
          ? {}
          : { leaveKitchenMinutes: dto.leaveKitchenMinutes }),
        ...(dto.driverInstructions === undefined
          ? {}
          : { driverInstructions: dto.driverInstructions }),
        ...(dto.defaultDriverStaffId === undefined
          ? {}
          : { defaultDriverStaffId: dto.defaultDriverStaffId }),
      },
    });

    return this.getById(id);
  }

  // -------------------------------------------------------------------------
  // Menu visibility (configuration only; resolution is Step 10)
  // -------------------------------------------------------------------------

  async getMenuVisibility(id: string): Promise<unknown> {
    await this.findOrThrow(id);

    const [categories, dishes] = await Promise.all([
      this.prisma.companyHiddenCategory.findMany({
        where: { companyId: id },
        select: {
          menuCategory: { select: { id: true, slug: true, name: true } },
        },
      }),
      this.prisma.companyHiddenDish.findMany({
        where: { companyId: id },
        select: { dish: { select: { id: true, sku: true, name: true } } },
      }),
    ]);

    return {
      hiddenCategories: categories.map((entry) => entry.menuCategory),
      hiddenDishes: dishes.map((entry) => entry.dish),
    };
  }

  /**
   * Replaces the whole visibility configuration in one transaction, so the
   * company never momentarily sees dishes an admin just hid.
   *
   * Nothing in the catalogue is deleted: hiding is company-scoped data.
   */
  async replaceMenuVisibility(
    id: string,
    dto: UpdateMenuVisibilityDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);

    const categoryIds = [...new Set(dto.hiddenCategoryIds)];
    const dishIds = [...new Set(dto.hiddenDishIds)];

    await this.assertAllExist('menuCategory', categoryIds, (ids) =>
      this.prisma.menuCategory.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      }),
    );
    await this.assertAllExist('dish', dishIds, (ids) =>
      this.prisma.dish.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      }),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.companyHiddenCategory.deleteMany({ where: { companyId: id } });
      await tx.companyHiddenDish.deleteMany({ where: { companyId: id } });

      if (categoryIds.length > 0) {
        await tx.companyHiddenCategory.createMany({
          data: categoryIds.map((menuCategoryId) => ({
            companyId: id,
            menuCategoryId,
          })),
        });
      }

      if (dishIds.length > 0) {
        await tx.companyHiddenDish.createMany({
          data: dishIds.map((dishId) => ({ companyId: id, dishId })),
        });
      }
    });

    return this.getMenuVisibility(id);
  }

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  async findOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: COMPANY_SELECT,
    });

    if (!company) {
      throw new CompanyNotFoundError(id);
    }

    return company;
  }

  /** Domains a company's employees may mail from. */
  async approvedDomains(companyId: string): Promise<string[]> {
    const domains = await this.prisma.companyDomain.findMany({
      where: { companyId },
      select: { domain: true },
    });

    return domains.map((entry) => entry.domain);
  }

  private async findAddressOrThrow(companyId: string, addressId: string) {
    const address = await this.prisma.companyAddress.findUnique({
      where: { id: addressId },
      select: { id: true, companyId: true, label: true },
    });

    if (!address) {
      throw new CompanyAddressNotFoundError(addressId);
    }

    if (address.companyId !== companyId) {
      throw new CompanyAddressNotOwnedError(addressId, companyId);
    }

    return address;
  }

  private async assertOwnerBelongsToCompany(
    companyId: string,
    employeeId: string,
  ): Promise<void> {
    const employee = await this.prisma.customerEmployee.findUnique({
      where: { id: employeeId },
      select: { companyId: true, active: true },
    });

    if (!employee || employee.companyId !== companyId || !employee.active) {
      throw new CompanyOwnerInvalidError(employeeId, companyId);
    }
  }

  private async assertPriceTierExists(priceTierId: string): Promise<void> {
    const tier = await this.prisma.priceTier.findUnique({
      where: { id: priceTierId },
      select: { id: true },
    });

    if (!tier) {
      throw new PriceTierNotFoundError(priceTierId);
    }
  }

  private async assertNameAvailable(name: string): Promise<void> {
    const existing = await this.prisma.company.findFirst({
      where: { name },
      select: { id: true },
    });

    if (existing) {
      throw new CompanyNameConflictError(name);
    }
  }

  private async assertAddressLabelFree(
    companyId: string,
    label: string,
  ): Promise<void> {
    const existing = await this.prisma.companyAddress.findFirst({
      where: { companyId, label, active: true },
      select: { id: true },
    });

    if (existing) {
      throw new CompanyAddressConflictError(label);
    }
  }

  private assertAddressLabelsUnique(
    addresses: readonly CompanyAddressInputDto[],
  ): void {
    const seen = new Set<string>();

    for (const address of addresses) {
      if (seen.has(address.label)) {
        throw new CompanyAddressConflictError(address.label);
      }

      seen.add(address.label);
    }
  }

  /** Normalizes, rejects public providers, and rejects repeats in the input. */
  private normalizeDomains(raw: readonly string[]): string[] {
    const normalized: string[] = [];
    const seen = new Set<string>();

    for (const value of raw) {
      const domain = normalizeCompanyDomain(value);

      if (seen.has(domain)) {
        throw new DuplicateCompanyDomainError(domain);
      }

      seen.add(domain);
      normalized.push(domain);
    }

    return normalized;
  }

  private async assertDomainsFree(domains: readonly string[]): Promise<void> {
    const taken = await this.prisma.companyDomain.findMany({
      where: { domain: { in: [...domains] } },
      select: { domain: true },
    });

    if (taken.length > 0) {
      throw new CompanyDomainAlreadyUsedError(taken[0].domain);
    }
  }

  private validateWorkingDays(workingDays: readonly Weekday[]): Weekday[] {
    if (workingDays.length === 0) {
      throw new InvalidWorkingDayError(
        'A company must be able to receive deliveries on at least one weekday.',
      );
    }

    const unique = [...new Set(workingDays)];

    if (unique.length !== workingDays.length) {
      throw new InvalidWorkingDayError('Each weekday may be listed only once.', {
        workingDays: [...workingDays],
      });
    }

    return this.sortWeekdays(unique);
  }

  private sortWeekdays(workingDays: readonly Weekday[]): Weekday[] {
    return [...workingDays].sort(
      (left, right) => WEEKDAYS.indexOf(left) - WEEKDAYS.indexOf(right),
    );
  }

  private async assertAllExist(
    reference: 'menuCategory' | 'dish',
    ids: readonly string[],
    load: (ids: string[]) => Promise<{ id: string }[]>,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const found = await load([...ids]);
    const foundIds = new Set(found.map((row) => row.id));
    const missing = ids.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new MenuReferenceNotFoundError(reference, missing);
    }
  }

  private addressData(companyId: string, dto: CompanyAddressInputDto) {
    return {
      companyId,
      label: dto.label,
      line1: dto.line1,
      line2: dto.line2 ?? null,
      city: dto.city,
      state: dto.state ?? null,
      postalCode: dto.postalCode,
      country: (dto.country ?? 'IN').toUpperCase(),
      deliveryNotes: dto.deliveryNotes ?? null,
      active: true,
    };
  }

  private toResponse(company: CompanyRow): unknown {
    return {
      id: company.id,
      name: company.name,
      legalName: company.legalName,
      active: company.active,
      priceTier: company.priceTier,
      owner: company.owner,
      billingContact: {
        name: company.billingContactName,
        email: company.billingContactEmail,
        phone: company.billingContactPhone,
      },
      deliveryDefaults: {
        defaultAddressId: company.defaultAddressId,
        defaultDeliveryTime: company.defaultDeliveryTime
          ? this.kitchenTime.toTimeString(company.defaultDeliveryTime)
          : null,
        packagingType: company.defaultPackaging,
        leaveKitchenMinutes: company.leaveKitchenMinutes,
        driverInstructions: company.driverInstructions,
        defaultDriver: company.defaultDriver,
      },
      domains: company.domains,
      addresses: company.addresses,
      workingDays: this.sortWeekdays(
        company.workingDays.map((row) => row.weekday as Weekday),
      ),
      employeeCount: company._count.employees,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };
  }
}

/** Mon-Fri, used when a company is created without an explicit calendar. */
const DEFAULT_WORKING_WEEK: Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

type CompanyRow = {
  id: string;
  name: string;
  legalName: string | null;
  active: boolean;
  billingContactName: string | null;
  billingContactEmail: string | null;
  billingContactPhone: string | null;
  ownerEmployeeId: string | null;
  defaultAddressId: string | null;
  defaultDeliveryTime: Date | null;
  defaultPackagingTypeId: string | null;
  leaveKitchenMinutes: number;
  driverInstructions: string | null;
  defaultDriverStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
  priceTier: { id: string; code: string; name: string } | null;
  owner: { id: string; fullName: string; email: string } | null;
  defaultDriver: { id: string; staffCode: string; fullName: string } | null;
  defaultPackaging: { id: string; code: string; name: string } | null;
  domains: { id: string; domain: string }[];
  addresses: unknown[];
  workingDays: { weekday: string }[];
  _count: { employees: number };
};
