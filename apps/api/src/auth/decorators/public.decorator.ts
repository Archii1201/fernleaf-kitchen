import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Marks a route as reachable without a token. Authentication is on by default
 * (the guards are global), so opting out has to be explicit and greppable.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
