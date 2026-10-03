/** Name of the httpOnly cookie that carries the access token. */
export const AUTH_COOKIE_NAME = 'fernleaf_token';

/** Token lifetime, as required by the assignment. */
export const TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const JWT_EXPIRES_IN = `${TOKEN_TTL_SECONDS}s`;

/** Cost factor for password hashing. */
export const PASSWORD_SALT_ROUNDS = 12;
