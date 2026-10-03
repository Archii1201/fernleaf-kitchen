import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { TOKEN_TTL_SECONDS } from './auth.constants.js';
import { InvalidCredentialsError } from './auth.errors.js';
import { PasswordService } from './password.service.js';
import { PermissionService } from './permission.service.js';
import type { AuthenticatedUser, JwtPayload } from './types/authenticated-user.js';

export interface LoginResult {
  accessToken: string;
  expiresInSeconds: number;
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Verifies credentials and issues a token. The returned user is assembled
   * field by field, so a password hash can never leak into a response.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        active: true,
        roleId: true,
        role: { select: { name: true } },
      },
    });

    if (!user || !user.active) {
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.passwordService.verify(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new InvalidCredentialsError();
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      expiresInSeconds: TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        roleId: user.roleId,
        roleName: user.role.name,
      },
    };
  }

  /** The caller's own profile plus the permissions their role grants. */
  async getProfile(
    user: AuthenticatedUser,
  ): Promise<AuthenticatedUser & { permissions: string[] }> {
    return {
      ...user,
      permissions: await this.permissionService.getPermissionKeys(user.id),
    };
  }
}
