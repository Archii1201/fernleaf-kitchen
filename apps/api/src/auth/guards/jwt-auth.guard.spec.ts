import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AUTH_COOKIE_NAME } from '../auth.constants.js';
import { InvalidTokenError, MissingAuthenticationError } from '../auth.errors.js';
import type { RequestWithUser } from '../types/authenticated-user.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const userRow = {
  id: 'user-1',
  email: 'admin@test.com',
  active: true,
  roleId: 'role-1',
  role: { name: 'Admin' },
};

function createContext(request: Partial<RequestWithUser>): {
  context: ExecutionContext;
  request: RequestWithUser;
} {
  const fullRequest = { headers: {}, ...request } as RequestWithUser;

  return {
    request: fullRequest,
    context: {
      getType: () => 'http',
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => fullRequest }),
    } as unknown as ExecutionContext,
  };
}

function createGuard(options: {
  isPublic?: boolean;
  payload?: unknown;
  verifyThrows?: boolean;
  user?: typeof userRow | null;
}) {
  const getAllAndOverride = vi.fn().mockReturnValue(options.isPublic ?? false);
  const verifyAsync = options.verifyThrows
    ? vi.fn().mockRejectedValue(new Error('jwt expired'))
    : vi.fn().mockResolvedValue(options.payload ?? { sub: 'user-1', email: 'admin@test.com' });
  const findUnique = vi
    .fn()
    .mockResolvedValue(options.user === undefined ? userRow : options.user);

  const guard = new JwtAuthGuard(
    { getAllAndOverride } as unknown as Reflector,
    { verifyAsync } as unknown as JwtService,
    { user: { findUnique } } as unknown as PrismaService,
  );

  return { guard, verifyAsync, findUnique };
}

describe('JwtAuthGuard', () => {
  it('rejects a request with no token', async () => {
    const { guard } = createGuard({});
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      MissingAuthenticationError,
    );
  });

  it('accepts a token from the httpOnly cookie and attaches the user', async () => {
    const { guard } = createGuard({});
    const { context, request } = createContext({
      cookies: { [AUTH_COOKIE_NAME]: 'valid.jwt' },
    } as Partial<RequestWithUser>);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({
      id: 'user-1',
      email: 'admin@test.com',
      roleId: 'role-1',
      roleName: 'Admin',
    });
  });

  it('accepts a bearer token as a fallback', async () => {
    const { guard, verifyAsync } = createGuard({});
    const { context } = createContext({
      headers: { authorization: 'Bearer valid.jwt' },
    } as Partial<RequestWithUser>);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAsync).toHaveBeenCalledWith('valid.jwt');
  });

  it('rejects an expired or malformed token', async () => {
    const { guard } = createGuard({ verifyThrows: true });
    const { context } = createContext({
      cookies: { [AUTH_COOKIE_NAME]: 'expired.jwt' },
    } as Partial<RequestWithUser>);

    await expect(guard.canActivate(context)).rejects.toThrow(InvalidTokenError);
  });

  it('rejects a token whose user no longer exists', async () => {
    const { guard } = createGuard({ user: null });
    const { context } = createContext({
      cookies: { [AUTH_COOKIE_NAME]: 'valid.jwt' },
    } as Partial<RequestWithUser>);

    await expect(guard.canActivate(context)).rejects.toThrow(InvalidTokenError);
  });

  it('rejects a token whose user has been deactivated', async () => {
    const { guard } = createGuard({ user: { ...userRow, active: false } });
    const { context } = createContext({
      cookies: { [AUTH_COOKIE_NAME]: 'valid.jwt' },
    } as Partial<RequestWithUser>);

    await expect(guard.canActivate(context)).rejects.toThrow(InvalidTokenError);
  });

  it('lets a @Public() route through without a token', async () => {
    const { guard, verifyAsync } = createGuard({ isPublic: true });
    const { context } = createContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(verifyAsync).not.toHaveBeenCalled();
  });
});
