import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  paginate,
  type PaginatedResponse,
} from '../common/pagination/index.js';
import {
  CompanyAddressNotFoundError,
  CompanyAddressNotOwnedError,
  CompanyNotFoundError,
} from '../companies/companies.errors.js';
import {
  domainOfEmail,
  normalizeEmail,
} from '../companies/domain/email-domain.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateEmployeeDto,
  ListEmployeeQueryDto,
  UpdateEmployeeDto,
} from './dto/employee.dto.js';
import {
  EmployeeDomainMismatchError,
  EmployeeEmailConflictError,
  EmployeeNotFoundError,
  EmployeeOwnsCompanyError,
  UnknownEmployeeReferenceError,
} from './employees.errors.js';

const EMPLOYEE_SELECT = {
  id: true,
  companyId: true,
  email: true,
  fullName: true,
  phone: true,
  defaultAddressId: true,
  canChooseAddress: true,
  canChooseDeliveryTime: true,
  canChoosePackaging: true,
  allergyNotes: true,
  dietaryNotes: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { id: true, name: true } },
  defaultAddress: { select: { id: true, label: true, city: true } },
  allergens: {
    select: { allergen: { select: { id: true, code: true, name: true } } },
  },
  dietaryTags: {
    select: { dietaryTag: { select: { id: true, code: true, name: true } } },
  },
  ownedCompany: { select: { id: true } },
} as const;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEmployeeQueryDto): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.CustomerEmployeeWhereInput = {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.customerEmployee.count({ where }),
      this.prisma.customerEmployee.findMany({
        where,
        select: EMPLOYEE_SELECT,
        orderBy: { fullName: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return paginate(rows.map(toResponse), {
      page: query.page,
      limit: query.limit,
      total,
    });
  }

  async getById(id: string): Promise<unknown> {
    return toResponse(await this.findOrThrow(id));
  }

  async create(dto: CreateEmployeeDto): Promise<unknown> {
    const email = normalizeEmail(dto.email);

    await this.assertCompanyExists(dto.companyId);
    await this.assertEmailAvailable(email);
    await this.assertEmailOnApprovedDomain(dto.companyId, email);

    if (dto.defaultAddressId) {
      await this.assertAddressBelongsToCompany(
        dto.companyId,
        dto.defaultAddressId,
      );
    }

    await this.assertReferences(dto.allergenIds, dto.dietaryTagIds);

    const id = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.customerEmployee.create({
        data: {
          companyId: dto.companyId,
          email,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          defaultAddressId: dto.defaultAddressId ?? null,
          canChooseAddress: dto.canChooseAddress ?? false,
          canChooseDeliveryTime: dto.canChooseDeliveryTime ?? false,
          canChoosePackaging: dto.canChoosePackaging ?? false,
          allergyNotes: dto.allergyNotes ?? null,
          dietaryNotes: dto.dietaryNotes ?? null,
          active: true,
        },
        select: { id: true },
      });

      await this.replaceDietaryLinks(
        tx,
        employee.id,
        dto.allergenIds,
        dto.dietaryTagIds,
      );

      return employee.id;
    });

    return this.getById(id);
  }

  /**
   * Updates an employee, including **moving them to another company**.
   *
   * Moving changes `CustomerEmployee.companyId` and nothing else. Orders carry
   * their own `companyId`, their own `customerEmployeeId` and a full snapshot
   * of the delivery address, so yesterday's order stays attached to the
   * company that actually ordered it. There is deliberately no
   * `UPDATE "Order" SET "companyId" = ...` anywhere in this service.
   */
  async update(id: string, dto: UpdateEmployeeDto): Promise<unknown> {
    const employee = await this.findOrThrow(id);
    const targetCompanyId = dto.companyId ?? employee.companyId;
    const isMoving = targetCompanyId !== employee.companyId;

    if (isMoving || dto.active === false) {
      // The owner link is company-scoped; letting an owner walk out or go
      // inactive would leave their company pointing at an outsider.
      if (employee.ownedCompany) {
        throw new EmployeeOwnsCompanyError(id, employee.companyId);
      }
    }

    if (isMoving) {
      await this.assertCompanyExists(targetCompanyId);
    }

    const email = dto.email ? normalizeEmail(dto.email) : employee.email;

    if (email !== employee.email) {
      await this.assertEmailAvailable(email, id);
    }

    // Re-checked whenever either side of the pairing changes.
    if (email !== employee.email || isMoving) {
      await this.assertEmailOnApprovedDomain(targetCompanyId, email);
    }

    // A move invalidates the old company's address; keep it only if the new
    // company owns it.
    const defaultAddressId =
      dto.defaultAddressId === undefined
        ? isMoving
          ? null
          : employee.defaultAddressId
        : dto.defaultAddressId;

    if (defaultAddressId) {
      await this.assertAddressBelongsToCompany(
        targetCompanyId,
        defaultAddressId,
      );
    }

    await this.assertReferences(dto.allergenIds, dto.dietaryTagIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.customerEmployee.update({
        where: { id },
        data: {
          companyId: targetCompanyId,
          email,
          defaultAddressId,
          ...(dto.fullName === undefined ? {} : { fullName: dto.fullName }),
          ...(dto.phone === undefined ? {} : { phone: dto.phone }),
          ...(dto.canChooseAddress === undefined
            ? {}
            : { canChooseAddress: dto.canChooseAddress }),
          ...(dto.canChooseDeliveryTime === undefined
            ? {}
            : { canChooseDeliveryTime: dto.canChooseDeliveryTime }),
          ...(dto.canChoosePackaging === undefined
            ? {}
            : { canChoosePackaging: dto.canChoosePackaging }),
          ...(dto.allergyNotes === undefined
            ? {}
            : { allergyNotes: dto.allergyNotes }),
          ...(dto.dietaryNotes === undefined
            ? {}
            : { dietaryNotes: dto.dietaryNotes }),
          ...(dto.active === undefined ? {} : { active: dto.active }),
        },
      });

      await this.replaceDietaryLinks(
        tx,
        id,
        dto.allergenIds,
        dto.dietaryTagIds,
      );
    });

    return this.getById(id);
  }

  private async findOrThrow(id: string) {
    const employee = await this.prisma.customerEmployee.findUnique({
      where: { id },
      select: EMPLOYEE_SELECT,
    });

    if (!employee) {
      throw new EmployeeNotFoundError(id);
    }

    return employee;
  }

  private async assertCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new CompanyNotFoundError(companyId);
    }
  }

  private async assertEmailAvailable(
    email: string,
    allowId?: string,
  ): Promise<void> {
    const existing = await this.prisma.customerEmployee.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing && existing.id !== allowId) {
      throw new EmployeeEmailConflictError(email);
    }
  }

  /**
   * An employee's email must sit on one of their company's approved domains.
   * That pairing is what lets a self-service signup be matched to a company
   * later without anyone typing a company id.
   */
  private async assertEmailOnApprovedDomain(
    companyId: string,
    email: string,
  ): Promise<void> {
    const approved = await this.prisma.companyDomain.findMany({
      where: { companyId },
      select: { domain: true },
    });
    const domains = approved.map((entry) => entry.domain);

    if (!domains.includes(domainOfEmail(email))) {
      throw new EmployeeDomainMismatchError(email, domains);
    }
  }

  private async assertAddressBelongsToCompany(
    companyId: string,
    addressId: string,
  ): Promise<void> {
    const address = await this.prisma.companyAddress.findUnique({
      where: { id: addressId },
      select: { companyId: true },
    });

    if (!address) {
      throw new CompanyAddressNotFoundError(addressId);
    }

    if (address.companyId !== companyId) {
      throw new CompanyAddressNotOwnedError(addressId, companyId);
    }
  }

  private async assertReferences(
    allergenIds?: string[],
    dietaryTagIds?: string[],
  ): Promise<void> {
    if (allergenIds?.length) {
      const found = await this.prisma.allergen.findMany({
        where: { id: { in: allergenIds } },
        select: { id: true },
      });

      this.assertNoneMissing('allergen', allergenIds, found);
    }

    if (dietaryTagIds?.length) {
      const found = await this.prisma.dietaryTag.findMany({
        where: { id: { in: dietaryTagIds } },
        select: { id: true },
      });

      this.assertNoneMissing('dietaryTag', dietaryTagIds, found);
    }
  }

  private assertNoneMissing(
    reference: 'allergen' | 'dietaryTag',
    ids: readonly string[],
    found: readonly { id: string }[],
  ): void {
    const foundIds = new Set(found.map((row) => row.id));
    const missing = [...new Set(ids)].filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new UnknownEmployeeReferenceError(reference, missing);
    }
  }

  private async replaceDietaryLinks(
    tx: Prisma.TransactionClient,
    customerEmployeeId: string,
    allergenIds?: string[],
    dietaryTagIds?: string[],
  ): Promise<void> {
    if (allergenIds) {
      await tx.customerEmployeeAllergen.deleteMany({
        where: { customerEmployeeId },
      });

      if (allergenIds.length > 0) {
        await tx.customerEmployeeAllergen.createMany({
          data: [...new Set(allergenIds)].map((allergenId) => ({
            customerEmployeeId,
            allergenId,
          })),
        });
      }
    }

    if (dietaryTagIds) {
      await tx.customerEmployeeDietaryTag.deleteMany({
        where: { customerEmployeeId },
      });

      if (dietaryTagIds.length > 0) {
        await tx.customerEmployeeDietaryTag.createMany({
          data: [...new Set(dietaryTagIds)].map((dietaryTagId) => ({
            customerEmployeeId,
            dietaryTagId,
          })),
        });
      }
    }
  }
}

type EmployeeRow = {
  id: string;
  companyId: string;
  email: string;
  fullName: string;
  phone: string | null;
  defaultAddressId: string | null;
  canChooseAddress: boolean;
  canChooseDeliveryTime: boolean;
  canChoosePackaging: boolean;
  allergyNotes: string | null;
  dietaryNotes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  company: { id: string; name: string };
  defaultAddress: { id: string; label: string; city: string } | null;
  allergens: { allergen: { id: string; code: string; name: string } }[];
  dietaryTags: { dietaryTag: { id: string; code: string; name: string } }[];
  ownedCompany: { id: string } | null;
};

function toResponse(employee: EmployeeRow) {
  return {
    id: employee.id,
    company: employee.company,
    email: employee.email,
    fullName: employee.fullName,
    phone: employee.phone,
    defaultAddress: employee.defaultAddress,
    // Order-time choices this person is allowed to make. These are NOT staff
    // RBAC permissions; they never grant access to any admin route.
    deliveryPermissions: {
      canChooseAddress: employee.canChooseAddress,
      canChooseDeliveryTime: employee.canChooseDeliveryTime,
      canChoosePackaging: employee.canChoosePackaging,
    },
    allergens: employee.allergens.map((entry) => entry.allergen),
    dietaryTags: employee.dietaryTags.map((entry) => entry.dietaryTag),
    allergyNotes: employee.allergyNotes,
    dietaryNotes: employee.dietaryNotes,
    ownsCompany: employee.ownedCompany !== null,
    active: employee.active,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}
