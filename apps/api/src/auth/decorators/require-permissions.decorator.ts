import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../permissions.js';

export const REQUIRED_PERMISSIONS_KEY = 'auth:requiredPermissions';

/**
 * Declares the permissions a route needs, for example
 * `@RequirePermissions('orders.edit')`. All listed permissions must be held
 * (AND, not OR). Authorization is expressed in terms of permissions, never
 * role names.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
