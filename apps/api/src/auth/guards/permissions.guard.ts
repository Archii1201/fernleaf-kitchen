import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InsufficientPermissionsError,
  MissingAuthenticationError,
} from '../auth.errors.js';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { PermissionService } from '../permission.service.js';
import type { RequestWithUser } from '../types/authenticated-user.js';

/**
 * Enforces `@RequirePermissions(...)`. Runs after `JwtAuthGuard`, so a caller
 * reaching it is already authenticated: a failure here is 403, not 401.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new MissingAuthenticationError();
    }

    const allowed = await this.permissionService.hasAll(
      request.user.id,
      required,
    );

    if (!allowed) {
      throw new InsufficientPermissionsError(required);
    }

    return true;
  }
}
