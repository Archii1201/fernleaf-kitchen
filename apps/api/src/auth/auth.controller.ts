import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env.schema.js';
import { AUTH_COOKIE_NAME, TOKEN_TTL_SECONDS } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { RequirePermissions } from './decorators/require-permissions.decorator.js';
import { AuthUserResponse, ProfileResponse } from './dto/auth-user.response.js';
import { LoginDto } from './dto/login.dto.js';
import { PERMISSIONS } from './permissions.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an httpOnly session cookie' })
  @ApiOkResponse({ type: AuthUserResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const result = await this.authService.login(dto.email, dto.password);

    // The token is only ever returned in the httpOnly cookie, never in the
    // response body, so page scripts cannot read it.
    response.cookie(AUTH_COOKIE_NAME, result.accessToken, this.cookieOptions());

    return result.user;
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the session cookie' })
  logout(@Res({ passthrough: true }) response: Response): void {
    const { maxAge: _maxAge, ...options } = this.cookieOptions();

    response.clearCookie(AUTH_COOKIE_NAME, options);
  }

  @Get('me')
  @RequirePermissions(PERMISSIONS.PROFILE_READ)
  @ApiOperation({ summary: 'The caller and the permissions their role grants' })
  @ApiOkResponse({ type: ProfileResponse })
  me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    return this.authService.getProfile(user);
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get('NODE_ENV', { infer: true }) === 'production',
      path: '/',
      maxAge: TOKEN_TTL_SECONDS * 1000,
    };
  }
}
