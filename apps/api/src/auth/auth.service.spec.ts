import type { JwtService } from '@nestjs/jwt';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { InvalidCredentialsError } from './auth.errors.js';
import type { PasswordService } from './password.service.js';
import type { PermissionService } from './permission.service.js';

const userRow = {
  id: 'user-1',
  email: 'admin@test.com',
  passwordHash: '$2b$12$hash',
  active: true,
  roleId: 'role-1',
  role: { name: 'Admin' },
};

function createService(overrides: {
  user?: typeof userRow | null;
  passwordMatches?: boolean;
}) {
  const findUnique = vi.fn().mockResolvedValue(
    overrides.user === undefined ? userRow : overrides.user,
  );
  const verify = vi.fn().mockResolvedValue(overrides.passwordMatches ?? true);
  const signAsync = vi.fn().mockResolvedValue('signed.jwt.token');
  const getPermissionKeys = vi.fn().mockResolvedValue(['profile.read']);

  const service = new AuthService(
    { user: { findUnique } } as unknown as PrismaService,
    { signAsync } as unknown as JwtService,
    { verify } as unknown as PasswordService,
    { getPermissionKeys } as unknown as PermissionService,
  );

  return { service, findUnique, verify, signAsync, getPermissionKeys };
}

describe('AuthService.login', () => {
  it('returns a token and safe user for valid credentials', async () => {
    const { service, signAsync } = createService({});

    const result = await service.login('admin@test.com', 'Test@1234');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.expiresInSeconds).toBe(12 * 60 * 60);
    expect(result.user).toEqual({
      id: 'user-1',
      email: 'admin@test.com',
      roleId: 'role-1',
      roleName: 'Admin',
    });
    expect(signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'admin@test.com',
    });
  });

  it('never exposes the password hash', async () => {
    const { service } = createService({});

    const result = await service.login('admin@test.com', 'Test@1234');

    expect(JSON.stringify(result.user)).not.toContain('$2b$');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('lowercases the email before looking the user up', async () => {
    const { service, findUnique } = createService({});

    await service.login('Admin@Test.com', 'Test@1234');

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'admin@test.com' } }),
    );
  });

  it('rejects an unknown email', async () => {
    const { service, verify } = createService({ user: null });

    await expect(service.login('nobody@test.com', 'Test@1234')).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects a wrong password', async () => {
    const { service, signAsync } = createService({ passwordMatches: false });

    await expect(service.login('admin@test.com', 'wrong')).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects a deactivated account', async () => {
    const { service } = createService({ user: { ...userRow, active: false } });

    await expect(service.login('admin@test.com', 'Test@1234')).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('uses one indistinguishable error so accounts cannot be enumerated', async () => {
    const unknown = createService({ user: null });
    const wrongPassword = createService({ passwordMatches: false });

    const first = (await unknown.service
      .login('nobody@test.com', 'Test@1234')
      .catch((error: unknown) => error)) as InvalidCredentialsError;
    const second = (await wrongPassword.service
      .login('admin@test.com', 'wrong')
      .catch((error: unknown) => error)) as InvalidCredentialsError;

    expect(first.code).toBe(second.code);
    expect(first.message).toBe(second.message);
  });
});

describe('AuthService.getProfile', () => {
  it('returns the caller plus their resolved permissions', async () => {
    const { service, getPermissionKeys } = createService({});

    const profile = await service.getProfile({
      id: 'user-1',
      email: 'admin@test.com',
      roleId: 'role-1',
      roleName: 'Admin',
    });

    expect(getPermissionKeys).toHaveBeenCalledWith('user-1');
    expect(profile.permissions).toEqual(['profile.read']);
  });
});
