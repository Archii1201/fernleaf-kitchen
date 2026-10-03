import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  paginate,
  type PaginatedResponse,
} from '../../common/pagination/index.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CatalogueCodeConflictError,
  OptionNotFoundError,
  UnknownReferenceError,
} from '../catalogue.errors.js';
import type {
  CreateOptionDto,
  ListOptionQueryDto,
  UpdateOptionDto,
} from './option.dto.js';

const OPTION_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  costCents: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  portionSize: { select: { id: true, code: true, name: true } },
  allergens: {
    select: { allergen: { select: { id: true, code: true, name: true } } },
  },
  dietaryTags: {
    select: { dietaryTag: { select: { id: true, code: true, name: true } } },
  },
} as const;

type OptionRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  costCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  portionSize: { id: string; code: string; name: string } | null;
  allergens: { allergen: { id: string; code: string; name: string } }[];
  dietaryTags: { dietaryTag: { id: string; code: string; name: string } }[];
};

function toOptionResponse(row: OptionRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    costCents: row.costCents,
    active: row.active,
    portionSize: row.portionSize,
    allergens: row.allergens.map((entry) => entry.allergen),
    dietaryTags: row.dietaryTags.map((entry) => entry.dietaryTag),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class OptionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListOptionQueryDto): Promise<PaginatedResponse<unknown>> {
    const where = query.active === undefined ? {} : { active: query.active };

    const [total, rows] = await Promise.all([
      this.prisma.option.count({ where }),
      this.prisma.option.findMany({
        where,
        select: OPTION_SELECT,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return paginate(rows.map(toOptionResponse), {
      page: query.page,
      limit: query.limit,
      total,
    });
  }

  async getById(id: string): Promise<unknown> {
    return toOptionResponse(await this.findOrThrow(id));
  }

  async create(dto: CreateOptionDto): Promise<unknown> {
    await this.assertReferences(dto);

    const existing = await this.prisma.option.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });

    if (existing) {
      throw new CatalogueCodeConflictError('option', dto.code);
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const option = await tx.option.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          costCents: dto.costCents,
          portionSizeId: dto.portionSizeId ?? null,
          active: true,
        },
        select: { id: true },
      });

      await this.replaceMemberships(
        tx,
        option.id,
        dto.allergenIds,
        dto.dietaryTagIds,
      );

      return option.id;
    });

    return this.getById(id);
  }

  async update(id: string, dto: UpdateOptionDto): Promise<unknown> {
    await this.findOrThrow(id);
    await this.assertReferences(dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.option.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description }),
          ...(dto.costCents === undefined ? {} : { costCents: dto.costCents }),
          ...(dto.portionSizeId === undefined
            ? {}
            : { portionSizeId: dto.portionSizeId }),
        },
      });

      await this.replaceMemberships(tx, id, dto.allergenIds, dto.dietaryTagIds);
    });

    return this.getById(id);
  }

  /** Options are deactivated, not deleted: order history references them. */
  async setActive(id: string, active: boolean): Promise<unknown> {
    await this.findOrThrow(id);

    await this.prisma.option.update({ where: { id }, data: { active } });

    return this.getById(id);
  }

  private async findOrThrow(id: string) {
    const option = await this.prisma.option.findUnique({
      where: { id },
      select: OPTION_SELECT,
    });

    if (!option) {
      throw new OptionNotFoundError(id);
    }

    return option;
  }

  private async assertReferences(
    dto: CreateOptionDto | UpdateOptionDto,
  ): Promise<void> {
    const checks: Array<[string, string[], Promise<{ id: string }[]>]> = [];

    if (dto.portionSizeId) {
      checks.push([
        'portionSize',
        [dto.portionSizeId],
        this.prisma.portionSize.findMany({
          where: { id: { in: [dto.portionSizeId] } },
          select: { id: true },
        }),
      ]);
    }

    if (dto.allergenIds?.length) {
      checks.push([
        'allergen',
        dto.allergenIds,
        this.prisma.allergen.findMany({
          where: { id: { in: dto.allergenIds } },
          select: { id: true },
        }),
      ]);
    }

    if (dto.dietaryTagIds?.length) {
      checks.push([
        'dietaryTag',
        dto.dietaryTagIds,
        this.prisma.dietaryTag.findMany({
          where: { id: { in: dto.dietaryTagIds } },
          select: { id: true },
        }),
      ]);
    }

    for (const [reference, ids, load] of checks) {
      const found = new Set((await load).map((row) => row.id));
      const missing = [...new Set(ids)].filter((id) => !found.has(id));

      if (missing.length > 0) {
        throw new UnknownReferenceError(reference, missing);
      }
    }
  }

  private async replaceMemberships(
    tx: Prisma.TransactionClient,
    optionId: string,
    allergenIds?: string[],
    dietaryTagIds?: string[],
  ): Promise<void> {
    if (allergenIds) {
      await tx.optionAllergen.deleteMany({ where: { optionId } });

      if (allergenIds.length > 0) {
        await tx.optionAllergen.createMany({
          data: [...new Set(allergenIds)].map((allergenId) => ({
            optionId,
            allergenId,
          })),
        });
      }
    }

    if (dietaryTagIds) {
      await tx.optionDietaryTag.deleteMany({ where: { optionId } });

      if (dietaryTagIds.length > 0) {
        await tx.optionDietaryTag.createMany({
          data: [...new Set(dietaryTagIds)].map((dietaryTagId) => ({
            optionId,
            dietaryTagId,
          })),
        });
      }
    }
  }
}
