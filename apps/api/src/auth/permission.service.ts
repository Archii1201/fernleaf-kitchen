import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Resolves what a user may do by walking
 * `User -> Role -> RolePermission -> Permission`.
 *
 * Permissions are read per request rather than embedded in the token, so
 * revoking a permission takes effect immediately instead of when the token
 * expires.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionKeys(userId: string): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({
      where: {
        roles: {
          some: { role: { users: { some: { id: userId, active: true } } } },
        },
      },
      select: { key: true },
      orderBy: { key: 'asc' },
    });

    return permissions.map((permission) => permission.key);
  }

  /** True only when the user holds every one of the required permissions. */
  async hasAll(
    userId: string,
    requiredPermissions: readonly string[],
  ): Promise<boolean> {
    if (requiredPermissions.length === 0) {
      return true;
    }

    const granted = new Set(await this.getPermissionKeys(userId));

    return requiredPermissions.every((permission) => granted.has(permission));
  }
}
