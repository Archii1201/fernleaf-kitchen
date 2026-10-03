import type { Request } from 'express';

/** The caller as resolved from a valid token. Never carries a password hash. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
}

/** Claims stored in the JWT. Kept minimal: no role, no permissions. */
export interface JwtPayload {
  sub: string;
  email: string;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
