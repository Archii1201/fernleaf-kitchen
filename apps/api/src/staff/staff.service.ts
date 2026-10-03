import { Injectable } from '@nestjs/common';
import { PasswordService } from '../auth/password.service.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import {
  paginate,
  type PaginatedResponse,
  type PaginationQueryDto,
} from '../common/pagination/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';
import type { StaffResponse } from './dto/staff.response.js';
import type { UpdateStaffDto } from './dto/update-staff.dto.js';
import {
  InvalidRoleError,
  SelfDeactivationForbiddenError,
  SelfRoleDowngradeForbiddenError,
  StaffCodeConflictError,
  StaffEmailConflictError,
  StaffNotFoundError,
  StaffProfileNotFoundError,
} from './staff.errors.js';

/** Columns returned to clients. `passwordHash` is never selected. */
const STAFF_SELECT = {
  id: true,
  email: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
  staff: {
    select: {
      staffCode: true,
      fullName: true,
      phone: true,
      jobTitle: true,
    },
  },
} as const;

interface StaffRow {
  id: string;
  email: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: { id: string; name: string };
  staff: {
    staffCode: string;
    fullName: string;
    phone: string | null;
    jobTitle: string | null;
  } | null;
}

function toResponse(row: StaffRow): StaffResponse {
  return {
    id: row.id,
    email: row.email,
    active: row.active,
    role: row.role,
    profile: row.staff,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async list(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<StaffResponse>> {
    const [total, rows] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        select: STAFF_SELECT,
        orderBy: { email: 'asc' },
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

  async getById(id: string): Promise<StaffResponse> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: STAFF_SELECT,
    });

    if (!row) {
      throw new StaffNotFoundError(id);
    }

    return toResponse(row);
  }

  async create(dto: CreateStaffDto): Promise<StaffResponse> {
    await this.assertRoleExists(dto.roleId);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new StaffEmailConflictError(dto.email);
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      return toResponse(
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: dto.email,
              passwordHash,
              roleId: dto.roleId,
              active: true,
            },
            select: { id: true },
          });

          await tx.staff.create({
            data: {
              userId: user.id,
              staffCode: dto.staffCode,
              fullName: dto.fullName,
              phone: dto.phone ?? null,
              jobTitle: dto.jobTitle ?? null,
            },
          });

          return tx.user.findUniqueOrThrow({
            where: { id: user.id },
            select: STAFF_SELECT,
          });
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Lost the race between the email check above and the insert, or the
        // staff code is already taken.
        throw new StaffCodeConflictError();
      }

      throw error;
    }
  }

  /** Profile fields only; email, role and active state are not touched here. */
  async updateProfile(id: string, dto: UpdateStaffDto): Promise<StaffResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, staff: { select: { id: true } } },
    });

    if (!user) {
      throw new StaffNotFoundError(id);
    }

    if (!user.staff) {
      throw new StaffProfileNotFoundError(id);
    }

    await this.prisma.staff.update({
      where: { id: user.staff.id },
      data: {
        ...(dto.fullName === undefined ? {} : { fullName: dto.fullName }),
        ...(dto.phone === undefined ? {} : { phone: dto.phone }),
        ...(dto.jobTitle === undefined ? {} : { jobTitle: dto.jobTitle }),
      },
    });

    return this.getById(id);
  }

  async updateRole(
    id: string,
    roleId: string,
    currentUser: AuthenticatedUser,
  ): Promise<StaffResponse> {
    const permissionKeys = await this.assertRoleExists(roleId);

    if (
      id === currentUser.id &&
      !permissionKeys.includes(PERMISSIONS.STAFF_MANAGE)
    ) {
      throw new SelfRoleDowngradeForbiddenError();
    }

    await this.assertStaffExists(id);

    await this.prisma.user.update({ where: { id }, data: { roleId } });

    return this.getById(id);
  }

  async updateActive(
    id: string,
    active: boolean,
    currentUser: AuthenticatedUser,
  ): Promise<StaffResponse> {
    if (id === currentUser.id && !active) {
      throw new SelfDeactivationForbiddenError();
    }

    await this.assertStaffExists(id);

    await this.prisma.user.update({ where: { id }, data: { active } });

    return this.getById(id);
  }

  private async assertStaffExists(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new StaffNotFoundError(id);
    }
  }

  /** Returns the permission keys the role grants. */
  private async assertRoleExists(roleId: string): Promise<string[]> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });

    if (!role) {
      throw new InvalidRoleError(roleId);
    }

    return role.permissions.map((entry) => entry.permission.key);
  }
}
