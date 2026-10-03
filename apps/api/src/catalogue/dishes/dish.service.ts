import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  paginate,
  type PaginatedResponse,
} from '../../common/pagination/index.js';
import { FilesService } from '../../files/files.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DishNotFoundError,
  DishSkuConflictError,
  UnknownReferenceError,
} from '../catalogue.errors.js';
import type {
  CombinationDishDefinition,
} from '../combinations/combination.types.js';
import type {
  CreateDishDto,
  ListDishQueryDto,
  SetDishOptionGroupsDto,
  UpdateDishDto,
} from './dish.dto.js';

const DISH_SELECT = {
  id: true,
  name: true,
  description: true,
  sku: true,
  temperature: true,
  costCents: true,
  moq: true,
  active: true,
  imageFileId: true,
  createdAt: true,
  updatedAt: true,
  kitchenStation: { select: { id: true, code: true, name: true } },
  portionSize: { select: { id: true, code: true, name: true } },
  allergens: {
    select: { allergen: { select: { id: true, code: true, name: true } } },
  },
  dietaryTags: {
    select: { dietaryTag: { select: { id: true, code: true, name: true } } },
  },
  optionGroups: {
    orderBy: { displayOrder: 'asc' },
    select: {
      displayOrder: true,
      required: true,
      optionGroup: {
        select: { id: true, code: true, name: true, required: true },
      },
    },
  },
} as const;

@Injectable()
export class DishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async list(query: ListDishQueryDto): Promise<PaginatedResponse<unknown>> {
    const where = {
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { sku: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.dish.count({ where }),
      this.prisma.dish.findMany({
        where,
        select: DISH_SELECT,
        orderBy: { name: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
    ]);

    return paginate(rows.map(toDishResponse), {
      page: query.page,
      limit: query.limit,
      total,
    });
  }

  async getById(id: string): Promise<unknown> {
    return toDishResponse(await this.findOrThrow(id));
  }

  async create(dto: CreateDishDto): Promise<unknown> {
    await this.assertReferences(dto);
    await this.assertSkuAvailable(dto.sku);

    const id = await this.prisma.$transaction(async (tx) => {
      const dish = await tx.dish.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          sku: dto.sku,
          temperature: dto.temperature,
          costCents: dto.costCents,
          kitchenStationId: dto.kitchenStationId,
          portionSizeId: dto.portionSizeId ?? null,
          imageFileId: dto.imageFileId ?? null,
          moq: dto.minimumOrderQuantity ?? null,
          active: true,
        },
        select: { id: true },
      });

      await this.replaceMemberships(tx, dish.id, dto.allergenIds, dto.dietaryTagIds);

      return dish.id;
    });

    return this.getById(id);
  }

  async update(id: string, dto: UpdateDishDto): Promise<unknown> {
    await this.findOrThrow(id);
    await this.assertReferences(dto);

    if (dto.sku !== undefined) {
      await this.assertSkuAvailable(dto.sku, id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dish.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description }),
          ...(dto.sku === undefined ? {} : { sku: dto.sku }),
          ...(dto.temperature === undefined
            ? {}
            : { temperature: dto.temperature }),
          ...(dto.costCents === undefined ? {} : { costCents: dto.costCents }),
          ...(dto.kitchenStationId === undefined
            ? {}
            : { kitchenStationId: dto.kitchenStationId }),
          ...(dto.portionSizeId === undefined
            ? {}
            : { portionSizeId: dto.portionSizeId }),
          ...(dto.imageFileId === undefined
            ? {}
            : { imageFileId: dto.imageFileId }),
          ...(dto.minimumOrderQuantity === undefined
            ? {}
            : { moq: dto.minimumOrderQuantity }),
        },
      });

      await this.replaceMemberships(tx, id, dto.allergenIds, dto.dietaryTagIds);
    });

    return this.getById(id);
  }

  /**
   * Dishes are deactivated, never deleted: historical order lines keep a
   * traceability foreign key to them.
   */
  async setActive(id: string, active: boolean): Promise<unknown> {
    await this.findOrThrow(id);

    await this.prisma.dish.update({ where: { id }, data: { active } });

    return this.getById(id);
  }

  /** Replaces the option groups offered for this dish, preserving order. */
  async setOptionGroups(
    id: string,
    dto: SetDishOptionGroupsDto,
  ): Promise<unknown> {
    await this.findOrThrow(id);
    await this.assertAllExist(
      'optionGroup',
      dto.optionGroupIds,
      (ids) =>
        this.prisma.optionGroup.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        }),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.dishOptionGroup.deleteMany({ where: { dishId: id } });

      for (const [index, optionGroupId] of dto.optionGroupIds.entries()) {
        await tx.dishOptionGroup.create({
          data: { dishId: id, optionGroupId, displayOrder: index },
        });
      }
    });

    return this.getById(id);
  }

  /**
   * Loads a dish in the shape `CombinationValidator` expects. Only active
   * option groups are offered, but option activity is reported as stored so
   * the validator can explain exactly which option became unavailable.
   */
  async loadForValidation(id: string): Promise<CombinationDishDefinition> {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        active: true,
        moq: true,
        optionGroups: {
          where: { active: true },
          orderBy: { displayOrder: 'asc' },
          select: {
            required: true,
            optionGroup: {
              select: {
                id: true,
                name: true,
                required: true,
                maxSelections: true,
                active: true,
                options: {
                  where: { active: true },
                  orderBy: { displayOrder: 'asc' },
                  select: {
                    option: {
                      select: { id: true, name: true, active: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!dish) {
      throw new DishNotFoundError(id);
    }

    return {
      id: dish.id,
      name: dish.name,
      active: dish.active,
      minimumOrderQuantity: dish.moq,
      optionGroups: dish.optionGroups
        .filter((link) => link.optionGroup.active)
        .map((link) => ({
          id: link.optionGroup.id,
          name: link.optionGroup.name,
          required: link.required ?? link.optionGroup.required,
          maxSelections: link.optionGroup.maxSelections,
          options: link.optionGroup.options.map((entry) => entry.option),
        })),
    };
  }

  private async findOrThrow(id: string) {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      select: DISH_SELECT,
    });

    if (!dish) {
      throw new DishNotFoundError(id);
    }

    return dish;
  }

  private async assertSkuAvailable(sku: string, allowId?: string) {
    const existing = await this.prisma.dish.findUnique({
      where: { sku },
      select: { id: true },
    });

    if (existing && existing.id !== allowId) {
      throw new DishSkuConflictError(sku);
    }
  }

  private async assertReferences(
    dto: CreateDishDto | UpdateDishDto,
  ): Promise<void> {
    if (dto.kitchenStationId) {
      await this.assertAllExist('kitchenStation', [dto.kitchenStationId], (ids) =>
        this.prisma.kitchenStation.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        }),
      );
    }

    if (dto.portionSizeId) {
      await this.assertAllExist('portionSize', [dto.portionSizeId], (ids) =>
        this.prisma.portionSize.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        }),
      );
    }

    if (dto.imageFileId) {
      await this.files.assertImage(dto.imageFileId);
    }

    if (dto.allergenIds?.length) {
      await this.assertAllExist('allergen', dto.allergenIds, (ids) =>
        this.prisma.allergen.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        }),
      );
    }

    if (dto.dietaryTagIds?.length) {
      await this.assertAllExist('dietaryTag', dto.dietaryTagIds, (ids) =>
        this.prisma.dietaryTag.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        }),
      );
    }
  }

  private async assertAllExist(
    reference: string,
    ids: string[],
    load: (ids: string[]) => Promise<{ id: string }[]>,
  ): Promise<void> {
    const unique = [...new Set(ids)];
    const found = await load(unique);
    const foundIds = new Set(found.map((row) => row.id));
    const missing = unique.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new UnknownReferenceError(reference, missing);
    }
  }

  private async replaceMemberships(
    tx: Prisma.TransactionClient,
    dishId: string,
    allergenIds?: string[],
    dietaryTagIds?: string[],
  ): Promise<void> {
    if (allergenIds) {
      await tx.dishAllergen.deleteMany({ where: { dishId } });

      if (allergenIds.length > 0) {
        await tx.dishAllergen.createMany({
          data: [...new Set(allergenIds)].map((allergenId) => ({
            dishId,
            allergenId,
          })),
        });
      }
    }

    if (dietaryTagIds) {
      await tx.dishDietaryTag.deleteMany({ where: { dishId } });

      if (dietaryTagIds.length > 0) {
        await tx.dishDietaryTag.createMany({
          data: [...new Set(dietaryTagIds)].map((dietaryTagId) => ({
            dishId,
            dietaryTagId,
          })),
        });
      }
    }
  }
}

type DishRow = {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  temperature: string;
  costCents: number;
  moq: number | null;
  active: boolean;
  imageFileId: string | null;
  createdAt: Date;
  updatedAt: Date;
  kitchenStation: { id: string; code: string; name: string };
  portionSize: { id: string; code: string; name: string } | null;
  allergens: { allergen: { id: string; code: string; name: string } }[];
  dietaryTags: { dietaryTag: { id: string; code: string; name: string } }[];
  optionGroups: {
    displayOrder: number;
    required: boolean | null;
    optionGroup: { id: string; code: string; name: string; required: boolean };
  }[];
};

function toDishResponse(row: DishRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sku: row.sku,
    temperature: row.temperature,
    costCents: row.costCents,
    minimumOrderQuantity: row.moq,
    active: row.active,
    kitchenStation: row.kitchenStation,
    portionSize: row.portionSize,
    imageFileId: row.imageFileId,
    allergens: row.allergens.map((entry) => entry.allergen),
    dietaryTags: row.dietaryTags.map((entry) => entry.dietaryTag),
    optionGroups: row.optionGroups.map((link) => ({
      ...link.optionGroup,
      required: link.required ?? link.optionGroup.required,
      displayOrder: link.displayOrder,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
