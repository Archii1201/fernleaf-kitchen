import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ReferenceItem {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

/**
 * Read-only lookups the admin UI needs to populate dropdowns. Reference rows
 * are seeded, not managed through the API, so there is no write surface here.
 */
@Injectable()
export class ReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  listAllergens(): Promise<ReferenceItem[]> {
    return this.prisma.allergen.findMany({
      select: { id: true, code: true, name: true, active: true },
      orderBy: { name: 'asc' },
    });
  }

  listDietaryTags(): Promise<ReferenceItem[]> {
    return this.prisma.dietaryTag.findMany({
      select: { id: true, code: true, name: true, active: true },
      orderBy: { name: 'asc' },
    });
  }

  listKitchenStations(): Promise<ReferenceItem[]> {
    return this.prisma.kitchenStation.findMany({
      select: { id: true, code: true, name: true, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  listPortionSizes(): Promise<ReferenceItem[]> {
    return this.prisma.portionSize.findMany({
      select: { id: true, code: true, name: true, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  listPackagingTypes(): Promise<ReferenceItem[]> {
    return this.prisma.packagingType.findMany({
      select: { id: true, code: true, name: true, active: true },
      orderBy: { name: 'asc' },
    });
  }
}
