import { z } from 'zod';

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;

const postgresUrl = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith('postgres://') || value.startsWith('postgresql://'),
    { message: 'must be a postgres:// or postgresql:// connection string' },
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TIMEZONE: z.string().min(1),
  APP_URL: z.url(),
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl,
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

export type NodeEnv = Env['NODE_ENV'];
