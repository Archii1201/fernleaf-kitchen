import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AUTH_COOKIE_NAME } from '../auth.constants.js';
import { InvalidTokenError, MissingAuthenticationError } from '../auth.errors.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { JwtPayload, RequestWithUser } from '../types/authenticated-user.js';

/**
 * Registered globally, so every route is authenticated unless it opts out with
 * `@Public()`. The token is read from the httpOnly cookie, with a Bearer
 * header accepted as a fallback for API clients and tests.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new MissingAuthenticationError();
    }

    const payload = await this.verify(token);

    // The account is re-read on every request so a deactivated user loses
    // access immediately rather than when their token expires.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        active: true,
        roleId: true,
        role: { select: { name: true } },
      },
    });

    if (!user || !user.active) {
      throw new InvalidTokenError();
    }

    request.user = {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
    };

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  private async verify(token: string): Promise<JwtPayload> {
    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      // The underlying reason (expired, malformed, bad signature) is not
      // echoed back to the client.
      throw new InvalidTokenError();
    }
  }

  private extractToken(request: RequestWithUser): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    const fromCookie = cookies?.[AUTH_COOKIE_NAME];

    if (fromCookie) {
      return fromCookie;
    }

    const header = request.headers.authorization;

    if (header?.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim() || undefined;
    }

    return undefined;
  }
}
