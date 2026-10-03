import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '../../auth/permissions.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DriverNotEligibleError,
  DriverNotFoundError,
} from '../companies.errors.js';
import { DriverEligibilityService } from './driver-eligibility.service.js';

function staffRow(overrides: {
  id?: string;
  active?: boolean;
  user?: {
    active: boolean;
    role: { permissions: { permission: { key: string } }[] };
  } | null;
}) {
  return {
    id: overrides.id ?? 'staff-1',
    staffCode: 'DRIVER-001',
    fullName: 'Delivery Driver',
    active: overrides.active ?? true,
    user: overrides.user === undefined
      ? {
          active: true,
          role: {
            permissions: [
              { permission: { key: PERMISSIONS.DELIVERY_UPDATE } },
            ],
          },
        }
      : overrides.user,
  };
}

describe('DriverEligibilityService', () => {
  let service: DriverEligibilityService;
  let prisma: {
    staff: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      staff: { findUnique: vi.fn(), findMany: vi.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DriverEligibilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(DriverEligibilityService);
  });

  it('accepts an active staff member who holds delivery.update', async () => {
    prisma.staff.findUnique.mockResolvedValue(staffRow({}));

    await expect(service.assertEligible('staff-1')).resolves.toBeUndefined();
  });

  it('rejects a missing staff record', async () => {
    prisma.staff.findUnique.mockResolvedValue(null);

    await expect(service.assertEligible('missing')).rejects.toThrow(
      DriverNotFoundError,
    );
  });

  it('rejects an inactive staff record', async () => {
    prisma.staff.findUnique.mockResolvedValue(staffRow({ active: false }));

    await expect(service.assertEligible('staff-1')).rejects.toThrow(
      DriverNotEligibleError,
    );
  });

  it('rejects a staff member whose role does not grant delivery work', async () => {
    prisma.staff.findUnique.mockResolvedValue(
      staffRow({
        user: {
          active: true,
          role: {
            permissions: [{ permission: { key: PERMISSIONS.KITCHEN_UPDATE } }],
          },
        },
      }),
    );

    await expect(service.assertEligible('staff-1')).rejects.toThrow(
      DriverNotEligibleError,
    );
  });

  it('lists only staff who hold delivery.update', async () => {
    prisma.staff.findMany.mockResolvedValue([
      staffRow({ id: 'driver' }),
      staffRow({
        id: 'chef',
        user: {
          active: true,
          role: {
            permissions: [{ permission: { key: PERMISSIONS.KITCHEN_UPDATE } }],
          },
        },
      }),
    ]);

    await expect(service.listEligible()).resolves.toEqual([
      { id: 'driver', staffCode: 'DRIVER-001', fullName: 'Delivery Driver' },
    ]);
  });
});
