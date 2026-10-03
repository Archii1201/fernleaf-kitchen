import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { MissingAuthenticationError } from '../auth.errors.js';
import type {
  AuthenticatedUser,
  RequestWithUser,
} from '../types/authenticated-user.js';

/**
 * Injects the authenticated caller, as resolved by `JwtAuthGuard`.
 * Only usable on guarded routes - on a `@Public()` route there is no user and
 * the decorator fails loudly instead of handing back `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new MissingAuthenticationError();
    }

    return request.user;
  },
);
