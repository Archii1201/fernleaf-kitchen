import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DishNotFoundError } from '../catalogue/catalogue.errors.js';
import type {
  CreateMenuCategoryDto,
  ReplaceMenuCategoryDishesDto,
  ReorderMenuCategoriesDto,
  UpdateMenuCategoryDishDto,
  UpdateMenuCategoryDto,
} from './dto/menu.dto.js';
import {
  MenuCategoryConflictError,
  MenuCategoryIdNotFoundError,
} from './menu.errors.js';

const CATEGORY_SELECT = {
  id: true,
  slug: true,
  name: true,
  displayOrder: true,
  isSecret: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  dishes: {
    orderBy: { displayOrder: 'asc' as const },
    select: {
      dishId: true,
      displayOrder: true,
      active: true,
      dish: { select: { id: true, sku: true, name: true, active: true } },
    },
  },
};

@Injectable()
export class MenuAdminService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.menuCategory.findMany({
      orderBy: { displayOrder: 'asc' },
      select: CATEGORY_SELECT,
    });
  }

  async createCategory(dto: CreateMenuCategoryDto) {
    await this.assertUnique(dto.slug, dto.name);

    return this.prisma.menuCategory.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        isSecret: dto.isSecret ?? false,
        displayOrder: dto.displayOrder ?? 0,
        active: true,
      },
      select: CATEGORY_SELECT,
    });
  }

  async updateCategory(id: string, dto: UpdateMenuCategoryDto) {
    const existing = await this.findCategory(id);

    if (dto.slug !== undefined && dto.slug !== existing.slug) {
      await this.assertUnique(dto.slug, undefined, id);
    }

    if (dto.name !== undefined && dto.name !== existing.name) {
      await this.assertUnique(undefined, dto.name, id);
    }

    return this.prisma.menuCategory.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.slug === undefined ? {} : { slug: dto.slug }),
        ...(dto.isSecret === undefined ? {} : { isSecret: dto.isSecret }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
      select: CATEGORY_SELECT,
    });
  }

  async reorderCategories(dto: ReorderMenuCategoriesDto) {
    const existing = await this.prisma.menuCategory.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existing.map((row) => row.id));
    const missing = dto.categoryIds.filter((id) => !existingIds.has(id));

    if (missing.length > 0) {
      throw new MenuCategoryIdNotFoundError(missing[0]);
    }

    await this.prisma.$transaction(
      dto.categoryIds.map((id, displayOrder) =>
        this.prisma.menuCategory.update({
          where: { id },
          data: { displayOrder },
        }),
      ),
    );

    return this.listCategories();
  }

  async replaceDishes(id: string, dto: ReplaceMenuCategoryDishesDto) {
    await this.findCategory(id);

    const dishIds = dto.dishes.map((entry) => entry.dishId);
    const unique = [...new Set(dishIds)];
    const found = await this.prisma.dish.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });

    if (found.length !== unique.length) {
      const foundIds = new Set(found.map((row) => row.id));
      throw new DishNotFoundError(unique.find((id) => !foundIds.has(id))!);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.menuCategoryDish.deleteMany({ where: { menuCategoryId: id } });
      if (dto.dishes.length === 0) {
        return;
      }

      await tx.menuCategoryDish.createMany({
        data: dto.dishes.map((entry, index) => ({
          menuCategoryId: id,
          dishId: entry.dishId,
          displayOrder: entry.displayOrder ?? index,
          active: entry.active ?? true,
        })),
      });
    });

    return this.findCategory(id);
  }

  async updateDish(
    categoryId: string,
    dishId: string,
    dto: UpdateMenuCategoryDishDto,
  ) {
    await this.findCategory(categoryId);

    const membership = await this.prisma.menuCategoryDish.findUnique({
      where: {
        menuCategoryId_dishId: { menuCategoryId: categoryId, dishId },
      },
    });

    if (!membership) {
      throw new DishNotFoundError(dishId);
    }

    await this.prisma.menuCategoryDish.update({
      where: { id: membership.id },
      data: {
        ...(dto.active === undefined ? {} : { active: dto.active }),
        ...(dto.displayOrder === undefined
          ? {}
          : { displayOrder: dto.displayOrder }),
      },
    });

    return this.findCategory(categoryId);
  }

  private async findCategory(id: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
      select: CATEGORY_SELECT,
    });

    if (!category) {
      throw new MenuCategoryIdNotFoundError(id);
    }

    return category;
  }

  private async assertUnique(
    slug: string | undefined,
    name: string | undefined,
    allowId?: string,
  ) {
    if (slug) {
      const clash = await this.prisma.menuCategory.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (clash && clash.id !== allowId) {
        throw new MenuCategoryConflictError('slug', slug);
      }
    }

    if (name) {
      const clash = await this.prisma.menuCategory.findUnique({
        where: { name },
        select: { id: true },
      });

      if (clash && clash.id !== allowId) {
        throw new MenuCategoryConflictError('name', name);
      }
    }
  }
}
