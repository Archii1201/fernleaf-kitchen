import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ReferenceConflictError,
  UnknownReferenceError,
} from '../catalogue.errors.js';
import type {
  CreateReferenceDto,
  ListReferenceQueryDto,
  UpdateReferenceDto,
} from './reference.dto.js';

export interface ReferenceItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sortOrder?: number;
}

export type ReferenceKind =
  | 'allergen'
  | 'dietaryTag'
  | 'kitchenStation'
  | 'portionSize'
  | 'packagingType';

const HAS_SORT: ReadonlySet<ReferenceKind> = new Set([
  'kitchenStation',
  'portionSize',
]);

@Injectable()
export class ReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  listAllergens(query: ListReferenceQueryDto = {}): Promise<ReferenceItem[]> {
    return this.list('allergen', query);
  }

  listDietaryTags(query: ListReferenceQueryDto = {}): Promise<ReferenceItem[]> {
    return this.list('dietaryTag', query);
  }

  listKitchenStations(
    query: ListReferenceQueryDto = {},
  ): Promise<ReferenceItem[]> {
    return this.list('kitchenStation', query);
  }

  listPortionSizes(query: ListReferenceQueryDto = {}): Promise<ReferenceItem[]> {
    return this.list('portionSize', query);
  }

  listPackagingTypes(
    query: ListReferenceQueryDto = {},
  ): Promise<ReferenceItem[]> {
    return this.list('packagingType', query);
  }

  createAllergen(dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.create('allergen', dto);
  }

  createDietaryTag(dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.create('dietaryTag', dto);
  }

  createKitchenStation(dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.create('kitchenStation', dto);
  }

  createPortionSize(dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.create('portionSize', dto);
  }

  createPackagingType(dto: CreateReferenceDto): Promise<ReferenceItem> {
    return this.create('packagingType', dto);
  }

  updateAllergen(id: string, dto: UpdateReferenceDto): Promise<ReferenceItem> {
    return this.update('allergen', id, dto);
  }

  updateDietaryTag(id: string, dto: UpdateReferenceDto): Promise<ReferenceItem> {
    return this.update('dietaryTag', id, dto);
  }

  updateKitchenStation(
    id: string,
    dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    return this.update('kitchenStation', id, dto);
  }

  updatePortionSize(id: string, dto: UpdateReferenceDto): Promise<ReferenceItem> {
    return this.update('portionSize', id, dto);
  }

  updatePackagingType(
    id: string,
    dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    return this.update('packagingType', id, dto);
  }

  private async list(
    kind: ReferenceKind,
    query: ListReferenceQueryDto,
  ): Promise<ReferenceItem[]> {
    const where = query.active === undefined ? {} : { active: query.active };

    if (kind === 'allergen') {
      return this.prisma.allergen.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
        },
        orderBy: { name: 'asc' },
      });
    }

    if (kind === 'dietaryTag') {
      return this.prisma.dietaryTag.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
        },
        orderBy: { name: 'asc' },
      });
    }

    if (kind === 'kitchenStation') {
      return this.prisma.kitchenStation.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }

    if (kind === 'portionSize') {
      return this.prisma.portionSize.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    }

    return this.prisma.packagingType.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        active: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  private async create(
    kind: ReferenceKind,
    dto: CreateReferenceDto,
  ): Promise<ReferenceItem> {
    await this.assertUnique(kind, dto.code, dto.name);

    try {
      if (kind === 'allergen') {
        return this.prisma.allergen.create({
          data: {
            code: dto.code,
            name: dto.name,
            active: true,
          },
        });
      }

      if (kind === 'dietaryTag') {
        return this.prisma.dietaryTag.create({
          data: {
            code: dto.code,
            name: dto.name,
            active: true,
          },
        });
      }

      if (kind === 'kitchenStation') {
        return this.prisma.kitchenStation.create({
          data: {
            code: dto.code,
            name: dto.name,
            active: true,
            sortOrder: dto.sortOrder ?? 0,
          },
        });
      }

      if (kind === 'portionSize') {
        return this.prisma.portionSize.create({
          data: {
            code: dto.code,
            name: dto.name,
            active: true,
            sortOrder: dto.sortOrder ?? 0,
          },
        });
      }

      return this.prisma.packagingType.create({
        data: {
          code: dto.code,
          name: dto.name,
          active: true,
        },
      });
    } catch (error) {
      this.rethrowConflict(kind, error);
    }
  }

  private async update(
    kind: ReferenceKind,
    id: string,
    dto: UpdateReferenceDto,
  ): Promise<ReferenceItem> {
    if (kind === 'allergen') {
      const existing = await this.prisma.allergen.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new UnknownReferenceError(kind, [id]);
      }

      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.assertUnique(kind, undefined, dto.name, id);
      }

      try {
        return await this.prisma.allergen.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name }),
            ...(dto.active === undefined ? {} : { active: dto.active }),
          },
        });
      } catch (error) {
        this.rethrowConflict(kind, error);
      }
    }

    if (kind === 'dietaryTag') {
      const existing = await this.prisma.dietaryTag.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new UnknownReferenceError(kind, [id]);
      }

      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.assertUnique(kind, undefined, dto.name, id);
      }

      try {
        return await this.prisma.dietaryTag.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name }),
            ...(dto.active === undefined ? {} : { active: dto.active }),
          },
        });
      } catch (error) {
        this.rethrowConflict(kind, error);
      }
    }

    if (kind === 'kitchenStation') {
      const existing = await this.prisma.kitchenStation.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new UnknownReferenceError(kind, [id]);
      }

      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.assertUnique(kind, undefined, dto.name, id);
      }

      try {
        return await this.prisma.kitchenStation.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name }),
            ...(dto.active === undefined ? {} : { active: dto.active }),
            ...(dto.sortOrder === undefined
              ? {}
              : { sortOrder: dto.sortOrder }),
          },
        });
      } catch (error) {
        this.rethrowConflict(kind, error);
      }
    }

    if (kind === 'portionSize') {
      const existing = await this.prisma.portionSize.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new UnknownReferenceError(kind, [id]);
      }

      if (dto.name !== undefined && dto.name !== existing.name) {
        await this.assertUnique(kind, undefined, dto.name, id);
      }

      try {
        return await this.prisma.portionSize.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name }),
            ...(dto.active === undefined ? {} : { active: dto.active }),
            ...(dto.sortOrder === undefined
              ? {}
              : { sortOrder: dto.sortOrder }),
          },
        });
      } catch (error) {
        this.rethrowConflict(kind, error);
      }
    }

    const existing = await this.prisma.packagingType.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new UnknownReferenceError(kind, [id]);
    }

    if (dto.name !== undefined && dto.name !== existing.name) {
      await this.assertUnique(kind, undefined, dto.name, id);
    }

    try {
      return await this.prisma.packagingType.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name }),
          ...(dto.active === undefined ? {} : { active: dto.active }),
        },
      });
    } catch (error) {
      this.rethrowConflict(kind, error);
    }
  }

  private async assertUnique(
    kind: ReferenceKind,
    code: string | undefined,
    name: string | undefined,
    allowId?: string,
  ): Promise<void> {
    if (kind === 'allergen') {
      if (code) {
        const clash = await this.prisma.allergen.findUnique({
          where: { code },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'code', code);
        }
      }

      if (name) {
        const clash = await this.prisma.allergen.findUnique({
          where: { name },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'name', name);
        }
      }

      return;
    }

    if (kind === 'dietaryTag') {
      if (code) {
        const clash = await this.prisma.dietaryTag.findUnique({
          where: { code },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'code', code);
        }
      }

      if (name) {
        const clash = await this.prisma.dietaryTag.findUnique({
          where: { name },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'name', name);
        }
      }

      return;
    }

    if (kind === 'kitchenStation') {
      if (code) {
        const clash = await this.prisma.kitchenStation.findUnique({
          where: { code },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'code', code);
        }
      }

      if (name) {
        const clash = await this.prisma.kitchenStation.findUnique({
          where: { name },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'name', name);
        }
      }

      return;
    }

    if (kind === 'portionSize') {
      if (code) {
        const clash = await this.prisma.portionSize.findUnique({
          where: { code },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'code', code);
        }
      }

      if (name) {
        const clash = await this.prisma.portionSize.findUnique({
          where: { name },
          select: { id: true },
        });

        if (clash && clash.id !== allowId) {
          throw new ReferenceConflictError(kind, 'name', name);
        }
      }

      return;
    }

    if (code) {
      const clash = await this.prisma.packagingType.findUnique({
        where: { code },
        select: { id: true },
      });

      if (clash && clash.id !== allowId) {
        throw new ReferenceConflictError(kind, 'code', code);
      }
    }

    if (name) {
      const clash = await this.prisma.packagingType.findUnique({
        where: { name },
        select: { id: true },
      });

      if (clash && clash.id !== allowId) {
        throw new ReferenceConflictError(kind, 'name', name);
      }
    }
  }

  private rethrowConflict(kind: ReferenceKind, error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = Array.isArray(error.meta?.target)
        ? String(error.meta.target[0])
        : 'code';
      const field = target.includes('name') ? 'name' : 'code';
      throw new ReferenceConflictError(kind, field, field);
    }

    throw error;
  }
}