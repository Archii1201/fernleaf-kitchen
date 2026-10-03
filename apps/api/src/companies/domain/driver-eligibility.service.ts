import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '../../auth/permissions.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  DriverNotEligibleError,
  DriverNotFoundError,
} from '../companies.errors.js';

/**
 * Decides whether a staff member may be a company's default driver.
 *
 * Eligibility is a *capability*, not a job title: the staff record must be
 * active and linked to an active user account whose role grants
 * `delivery.update`. Nothing here looks at a role name, so moving delivery
 * work to a new role is a seed change rather than a code change.
 */
@Injectable()
export class DriverEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async assertEligible(staffId: string): Promise<void> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        active: true,
        user: {
          select: {
            active: true,
            role: {
              select: { permissions: { select: { permission: { select: { key: true } } } } },
            },
          },
        },
      },
    });

    if (!staff) {
      throw new DriverNotFoundError(staffId);
    }

    if (!staff.active) {
      throw new DriverNotEligibleError(staffId, 'the staff record is inactive.');
    }

    if (!staff.user) {
      throw new DriverNotEligibleError(
        staffId,
        'they have no login, so no delivery permission can be resolved.',
      );
    }

    if (!staff.user.active) {
      throw new DriverNotEligibleError(staffId, 'their account is disabled.');
    }

    const granted = new Set(
      staff.user.role.permissions.map((entry) => entry.permission.key),
    );

    if (!granted.has(PERMISSIONS.DRIVER_UPDATE)) {
      throw new DriverNotEligibleError(
        staffId,
        `they do not hold the "${PERMISSIONS.DRIVER_UPDATE}" permission.`,
      );
    }
  }

  /**
   * Staff who may be assigned as a company's default driver. The filter is
   * the same capability check as `assertEligible`, so the picker and the
   * write path cannot disagree.
   */
  async listEligible(): Promise<
    { id: string; staffCode: string; fullName: string }[]
  > {
    const staff = await this.prisma.staff.findMany({
      where: { active: true, user: { active: true } },
      select: {
        id: true,
        staffCode: true,
        fullName: true,
        user: {
          select: {
            role: {
              select: {
                permissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return staff
      .filter((row) =>
        row.user?.role.permissions.some(
          (entry) => entry.permission.key === PERMISSIONS.DRIVER_UPDATE,
        ),
      )
      .map(({ id, staffCode, fullName }) => ({ id, staffCode, fullName }));
  }
}
