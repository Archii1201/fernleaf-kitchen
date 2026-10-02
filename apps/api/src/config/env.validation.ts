import { envSchema, type Env } from './env.schema.js';

/**
 * Startup validation hook for ConfigModule.
 *
 * Only variable names and validation messages are reported: environment values
 * (connection strings, secrets) are never included in the thrown error.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
