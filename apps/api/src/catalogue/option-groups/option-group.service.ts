import { Injectable } from '@nestjs/common';
import {
  paginate,
  type PaginatedResponse,
  type PaginationQueryDto,
} from '../../common/pagination/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CatalogueCodeConflictError,
  OptionGroupNotFoundError,
  UnknownReferenceError,
} from '../catalogue.errors.js';
import type {
  CreateOptionGroupDto,
  SetOptionGroupOptionsDto,
  UpdateOptionGroupDto,
} from './option-group.dto.js';

const GROUP_SELECT = {
  id: true,
  code: true,
  name: true,
  required: true,
  displayOrder: true,
  maxSelections: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  options: {
    orderBy: { displayOrder: 'asc' },
    select: {
      displayOrder: true,
      active: true,
      option: {
        select: { id: true, code: true, name: true, costCents: true, active: true },
      },
    },
  },
} as const;

type GroupRow = {
  id: string;
  code: string;
  name: string;
  required: boolean;
  displayOrder: number;
  maxSelections: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  options: {
    displayOrder: number;
    active: boolean;
    option: {
      id: string;
      code: string;
      name: string;
      costCents: number;
      active: boolean;
    };
  }[];
};

function toGroupResponse(row: GroupRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    required: row.required,
    displayOrder: row.displayOrder,
    maxSelections: row.maxSelections,
    active: row.active,
    options: row.options.map((member) => ({
      ...member.option,
      displayOrder: member.displayOrder,
      membershipActive: member.active,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class OptionGroupService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    const [total, rows] = await Promise.all([
      this.prisma.optionGroup.count(),
      this.prisma.optionGroup.findMany({
        select: GROUP_SELECT,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return paginate(rows.map(toGroupResponse), {
      page: query.page,
      limit: query.limit,
      total,
    });
  }

  async getById(id: string): Promise<unknown> {
    return toGroupResponse(await this.findOrThrow(id));
  }

  async create(dto: CreateOptionGroupDto): Promise<unknown> {
    const existing = await this.prisma.optionGroup.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });

    if (existing) {
      throw new CatalogueCodeConflictError('optionGroup', dto.code);
    }

    const created = await this.prisma.optionGroup.create({
      data: {
        code: dto.code,
        name: dto.name,
        required: dto.required,
        displayOrder: dto.displayOrder ?? 0,
        maxSelections: dto.maxSelections ?? null,
        active: true,
      },
      select: { id: true },
    });

    return this.getById(created.id);
  }

  async update(id: string, dto: UpdateOptionGroupDto): Promise<unknown> {
    await this.findOrThrow(id);

    await this.prisma.optionGroup.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.required === undefined ? {} : { required: dto.required }),
        ...(dto.displayOrder === undefined
          ? {}
          : { displayOrder: dto.displayOrder }),
        ...(dto.maxSelections === undefined
          ? {}
          : { maxSelections: dto.maxSelections }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
    });

    return this.getById(id);
  }

  /** Replaces group membership in one transaction so ordering stays coherent. */
  async setOptions(
    id: string,
    dto: SetOptionGroupOptionsDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);

    const optionIds = dto.options.map((member) => member.optionId);
    const unique = [...new Set(optionIds)];

    if (unique.length > 0) {
      const found = await this.prisma.option.findMany({
        where: { id: { in: unique } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((row) => row.id));
      const missing = unique.filter((optionId) => !foundIds.has(optionId));

      if (missing.length > 0) {
        throw new UnknownReferenceError('option', missing);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.optionGroupOption.deleteMany({ where: { optionGroupId: id } });

      for (const [index, member] of dto.options.entries()) {
        await tx.optionGroupOption.create({
          data: {
            optionGroupId: id,
            optionId: member.optionId,
            displayOrder: member.displayOrder ?? index,
          },
        });
      }
    });

    return this.getById(id);
  }

  private async findOrThrow(id: string) {
    const group = await this.prisma.optionGroup.findUnique({
      where: { id },
      select: GROUP_SELECT,
    });

    if (!group) {
      throw new OptionGroupNotFoundError(id);
    }

    return group;
  }
}
